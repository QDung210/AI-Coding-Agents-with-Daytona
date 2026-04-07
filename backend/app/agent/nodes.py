"""
LangGraph nodes for the AI Dev Workspace agent pipeline.

Pipeline:
  intake_node -> plan_node -> execute_node -> evaluate_node
  evaluate_node -> finalize_node  (pass or max retries reached)
  evaluate_node -> retry_node -> execute_node  (fail, retries left)
"""
from __future__ import annotations

import json
import re
from typing import Callable, Dict, List, Optional

from langchain_core.messages import HumanMessage, SystemMessage, AIMessage
from langchain_openai import ChatOpenAI

from app.agent.state import AgentState
from app.config import get_settings

settings = get_settings()


# ─────────────────────────────────────────────────────────────────────────────
# Global run-id → log_callback registry
# Lets pure node functions emit logs without carrying log_callback in state.
# ─────────────────────────────────────────────────────────────────────────────

_log_registry: Dict[str, Callable] = {}


def register_run_log(run_id: str, cb: Callable) -> None:
    _log_registry[run_id] = cb


def unregister_run_log(run_id: str) -> None:
    _log_registry.pop(run_id, None)


def _get_log(state: AgentState) -> Optional[Callable]:
    return _log_registry.get(state.get("run_id", ""))



def _make_llm(temperature: float = 0.2) -> ChatOpenAI:
    return ChatOpenAI(
        model="gpt-4o-mini",
        temperature=temperature,
        api_key=settings.openai_api_key,
    )


# ─────────────────────────────────────────────────────────────────────────────
# intake_node
# ─────────────────────────────────────────────────────────────────────────────

async def intake_node(state: AgentState) -> dict:
    """
    Classify the incoming task and decide on working directory / snapshot.
    """
    log_cb = _get_log(state)
    if log_cb:
        await _call_log(log_cb, "system", "[intake] Classifying task...")
    llm = _make_llm()

    system = SystemMessage(
        content=(
            "You are a task intake classifier for a code automation agent. "
            "Given a user prompt and optional repository URL, determine: "
            "1) A brief task classification (e.g. 'feature', 'bugfix', 'refactor', 'test', 'setup'). "
            "2) An appropriate working directory inside the sandbox (e.g. '/workspace/project'). "
            "Respond ONLY with valid JSON: "
            '{"classification": "<type>", "working_dir": "<path>", "notes": "<optional notes>"}'
        )
    )
    human = HumanMessage(
        content=(
            f"Prompt: {state['prompt']}\n"
            f"Repo URL: {state.get('repo_url') or 'none'}"
        )
    )

    response = await llm.ainvoke([system, human])
    raw = response.content.strip()

    # Parse JSON safely
    try:
        # Extract JSON block if wrapped in markdown
        match = re.search(r"\{.*\}", raw, re.DOTALL)
        parsed = json.loads(match.group(0) if match else raw)
        working_dir = parsed.get("working_dir", "/workspace/project")
        classification = parsed.get("classification", "task")
        notes = parsed.get("notes", "")
    except Exception:
        working_dir = "/workspace/project"
        classification = "task"
        notes = raw

    log_msg = f"Task classified as '{classification}'. Working dir: {working_dir}. {notes}"
    if log_cb:
        await _call_log(log_cb, "system", f"[intake] ✓ {log_msg}")

    return {
        "working_dir": working_dir,
        "current_step": "intake",
        "steps_completed": [],
        "messages": [
            SystemMessage(content=f"[intake] {log_msg}")
        ],
        "status": "running",
        "error": None,
    }


# ─────────────────────────────────────────────────────────────────────────────
# plan_node
# ─────────────────────────────────────────────────────────────────────────────

async def plan_node(state: AgentState) -> dict:
    """
    Ask the LLM to break the task into a numbered list of concrete steps.
    The steps will guide the execute_node.
    """
    log_cb = _get_log(state)
    if log_cb:
        await _call_log(log_cb, "system", "[plan] Generating execution plan...")
    llm = _make_llm(temperature=0.3)

    system = SystemMessage(
        content=(
            "You are a senior software engineer planning automated coding tasks. "
            "Break the user's request into a numbered list of concrete, executable steps "
            "that a code-execution agent can follow (clone repo, read/edit files, run tests, etc.). "
            "Be specific and actionable. Limit to 8 steps max.\n\n"
            "IMPORTANT: If the task involves creating a website, web app, or any frontend with HTML/CSS/JS, "
            "the LAST step MUST be: 'Start a detached web server on port 3000 using subprocess.Popen "
            "with start_new_session=True, then verify port 3000 is reachable via python3 socket check.'\n\n"
            "Respond with a numbered list only, no extra prose."
        )
    )
    human = HumanMessage(
        content=(
            f"Task: {state['prompt']}\n"
            f"Repo: {state.get('repo_url') or 'none'}\n"
            f"Working dir: {state['working_dir']}"
        )
    )

    response = await llm.ainvoke([system, human])
    plan_text = response.content.strip()

    if log_cb:
        await _call_log(log_cb, "system", f"[plan] Plan ready:\n{plan_text}")

    return {
        "current_step": "plan",
        "steps_completed": state.get("steps_completed", []) + ["intake"],
        "messages": [
            SystemMessage(content=f"[plan] Execution plan:\n{plan_text}"),
            HumanMessage(
                content=(
                    f"Please execute the following plan step by step using the available tools.\n\n"
                    f"PLAN:\n{plan_text}\n\n"
                    f"Task prompt: {state['prompt']}\n"
                    f"Working directory: {state['working_dir']}\n"
                    f"Repo URL: {state.get('repo_url') or 'none'}\n\n"
                    f"After completing the steps, summarize what you did and produce a unified diff/patch "
                    f"of any files you modified (if applicable)."
                )
            ),
        ],
    }


# ─────────────────────────────────────────────────────────────────────────────
# execute_node  (uses create_react_agent internally)
# ─────────────────────────────────────────────────────────────────────────────

async def make_execute_node(sandbox, log_callback: Optional[Callable] = None):
    """
    Returns an async execute_node function bound to a specific sandbox.
    Uses create_react_agent from langgraph.prebuilt.
    """
    from langgraph.prebuilt import create_react_agent
    from app.agent.tools import make_daytona_tools

    tools = make_daytona_tools(sandbox, log_callback=log_callback)
    llm = _make_llm(temperature=0.1)

    _EXECUTE_SYSTEM = (
        "You are a coding agent running commands inside a Daytona Linux sandbox. "
        "Rules you MUST follow:\n"
        "1. Each exec_command call is a FRESH shell — 'source', 'export', 'cd' do NOT "
        "   persist between calls. Always use absolute paths.\n"
        "2. Chain dependent commands in ONE call with '&&': "
        "   e.g. 'cd /workspace && python3 app.py'\n"
        "3. To run a background server use: 'nohup python3 /path/app.py > /tmp/app.log 2>&1 &'\n"
        "4. Use 'write_file' to create files — do NOT use echo/heredoc to write multi-line code.\n"
        "5. Install packages with 'apt-get install -y' or 'pip3 install' (not pip inside venv).\n"
        "6. If a command fails, read the error and fix it — don't retry the same command.\n"
        "7. Before using git, always run: "
        "git config --global user.email 'agent@daytona.io' && git config --global user.name 'Agent'\n"
        "8. Task is considered DONE when the requested files/code exist and the core functionality works. "
        "Git history and unit tests are optional unless explicitly requested.\n"
        "9. For ANY task that produces a website or web UI (HTML/CSS/JS files), you MUST start a web server "
        "as the FINAL step so the result is previewable. "
        "Use this exact pattern to start a DETACHED server that survives after the shell exits:\n"
        "   python3 -c \"import subprocess; p=subprocess.Popen(['python3','-m','http.server','3000','--directory','/path/to/project'],stdout=open('/tmp/srv.log','w'),stderr=subprocess.STDOUT,start_new_session=True); print('Server PID:',p.pid)\"\n"
        "   Then verify with: sleep 2 && python3 -c \"import socket,sys; s=socket.socket(); s.settimeout(3); r=s.connect_ex(('127.0.0.1',3000)); s.close(); print('UP' if r==0 else 'DOWN')\"\n"
        "   For Python/Node/Flask apps, also use subprocess.Popen with start_new_session=True."
    )

    react_agent = create_react_agent(llm, tools)

    async def execute_node(state: AgentState) -> dict:
        """Execute the planned steps using tools against the sandbox."""
        if log_callback:
            await _call_log(log_callback, "system", "[execute] Starting tool execution…")

        # Prepend system instructions as the first message so the agent knows
        # the sandbox rules (stateless shell, absolute paths, etc.)
        agent_input = {
            "messages": [SystemMessage(content=_EXECUTE_SYSTEM), *state["messages"]]
        }

        try:
            result = await react_agent.ainvoke(
                agent_input,
                config={"recursion_limit": 60},
            )
            new_messages = result.get("messages", [])

            # Extract final AI response text
            final_text = ""
            for msg in reversed(new_messages):
                if isinstance(msg, AIMessage) and msg.content:
                    final_text = msg.content if isinstance(msg.content, str) else str(msg.content)
                    break

            if log_callback:
                await _call_log(log_callback, "agent", f"[execute] Completed. Summary: {final_text[:300]}")

            # Try to detect test commands in messages and run them
            test_output = state.get("test_output", "")

            return {
                "current_step": "execute",
                "steps_completed": state.get("steps_completed", []) + ["plan"],
                "messages": new_messages[len(state["messages"]):],  # only append new messages
                "test_output": test_output,
            }
        except Exception as exc:
            error_msg = f"Execution error: {exc}"
            if log_callback:
                await _call_log(log_callback, "error", f"[execute] {error_msg}")
            return {
                "current_step": "execute",
                "steps_completed": state.get("steps_completed", []) + ["plan"],
                "messages": [SystemMessage(content=f"[execute:error] {error_msg}")],
                "error": error_msg,
                "status": "failed",
            }

    return execute_node


# ─────────────────────────────────────────────────────────────────────────────
# evaluate_node
# ─────────────────────────────────────────────────────────────────────────────

async def evaluate_node(state: AgentState) -> dict:
    """
    Evaluate whether the execution succeeded.
    Checks test_output, error state, and uses LLM to judge quality.
    """
    log_cb = _get_log(state)
    if log_cb:
        await _call_log(log_cb, "system", "[evaluate] Evaluating result...")
    llm = _make_llm(temperature=0)

    # If there was a hard error, fail immediately
    if state.get("error") and state.get("status") == "failed":
        return {
            "current_step": "evaluate",
            "steps_completed": state.get("steps_completed", []) + ["execute"],
            "messages": [SystemMessage(content="[evaluate] Hard error detected — marking failed.")],
            "status": "failed",
        }

    # Gather context for evaluation
    recent_messages = state.get("messages", [])[-10:]  # last 10 messages
    messages_text = "\n".join(
        f"{type(m).__name__}: {m.content[:500] if isinstance(m.content, str) else str(m.content)[:500]}"
        for m in recent_messages
        if hasattr(m, "content")
    )
    test_output = state.get("test_output", "")

    system = SystemMessage(
        content=(
            "You are a pragmatic code delivery evaluator. Judge whether the agent fulfilled the user's request.\n\n"
            "PASS criteria (any of these is enough):\n"
            "- The requested files/code were created and exist in the sandbox\n"
            "- A server/app was started and is running on a port\n"
            "- The core deliverable (website, script, API, etc.) was produced\n\n"
            "FAIL criteria (all must be true to fail):\n"
            "- The primary deliverable does NOT exist\n"
            "- A critical tool call returned a fatal error that was NOT recovered from\n\n"
            "IMPORTANT: Do NOT fail for missing git history, missing unit tests, or "
            "missing test output UNLESS the user explicitly asked for them. "
            "A static website with HTML/CSS/JS files created = PASS.\n\n"
            "Respond ONLY with valid JSON: "
            '{"passed": true/false, "reason": "<brief reason>"}'
        )
    )
    human = HumanMessage(
        content=(
            f"Original task: {state['prompt']}\n\n"
            f"Execution trace (last 10 messages):\n{messages_text}\n\n"
            f"Test output (may be empty for non-testable tasks):\n{test_output or '(none — acceptable for static/frontend tasks)'}"
        )
    )

    try:
        response = await llm.ainvoke([system, human])
        raw = response.content.strip()
        match = re.search(r"\{.*\}", raw, re.DOTALL)
        parsed = json.loads(match.group(0) if match else raw)
        passed = parsed.get("passed", False)
        reason = parsed.get("reason", raw)
    except Exception as exc:
        passed = False
        reason = f"Evaluation parse error: {exc}"

    retry_count = state.get("retry_count", 0)
    max_retries = state.get("max_retries", 2)

    if passed:
        new_status = "pass"
    elif retry_count >= max_retries:
        new_status = "max_retries_reached"
    else:
        new_status = "fail"

    if log_cb:
        await _call_log(log_cb, "system", f"[evaluate] {new_status}: {reason}")

    return {
        "current_step": "evaluate",
        "steps_completed": state.get("steps_completed", []) + ["execute"],
        "messages": [SystemMessage(content=f"[evaluate] {new_status}: {reason}")],
        "status": new_status,  # used by graph edges
        "test_output": test_output,
    }


# ─────────────────────────────────────────────────────────────────────────────
# retry_node
# ─────────────────────────────────────────────────────────────────────────────

async def retry_node(state: AgentState) -> dict:
    """
    Increment retry counter and prepare a revised instruction for execute_node.
    """
    log_cb = _get_log(state)
    retry_count = state.get("retry_count", 0) + 1
    if log_cb:
        await _call_log(log_cb, "system", f"[retry] Retrying... (attempt {retry_count})")

    # Summarise what went wrong so the next attempt can improve
    recent_messages = state.get("messages", [])[-5:]
    context = "\n".join(
        m.content if isinstance(m.content, str) else str(m.content)
        for m in recent_messages
        if hasattr(m, "content")
    )

    retry_prompt = (
        f"The previous attempt (attempt {retry_count}) did not fully satisfy the task. "
        f"Please review what was done and try again, addressing any issues.\n\n"
        f"Recent context:\n{context}\n\n"
        f"Original task: {state['prompt']}\n"
        f"Working dir: {state['working_dir']}"
    )

    return {
        "current_step": "retry",
        "retry_count": retry_count,
        "steps_completed": state.get("steps_completed", []) + ["evaluate"],
        "messages": [
            HumanMessage(content=retry_prompt)
        ],
        "status": "running",
        "error": None,
    }


# ─────────────────────────────────────────────────────────────────────────────
# finalize_node
# ─────────────────────────────────────────────────────────────────────────────

async def finalize_node(state: AgentState) -> dict:
    """
    Generate a final human-readable summary and (if applicable) a unified patch.
    """
    log_cb = _get_log(state)
    if log_cb:
        await _call_log(log_cb, "system", "[finalize] Writing summary...")
    llm = _make_llm(temperature=0.3)

    # Collect full message history for summarisation
    all_messages = state.get("messages", [])
    history_text = "\n".join(
        f"{type(m).__name__}: {m.content[:800] if isinstance(m.content, str) else str(m.content)[:800]}"
        for m in all_messages[-20:]  # last 20 messages
        if hasattr(m, "content")
    )

    system = SystemMessage(
        content=(
            "You are a technical writer summarising the work done by a coding agent. "
            "Given the execution history, produce:\n"
            "1) A concise summary (3-5 sentences) of what was accomplished.\n"
            "2) A unified diff / patch of any files that were modified (if available from the history). "
            "   Use standard unified diff format. If no files were modified, write 'No file changes.'.\n\n"
            "Respond ONLY with valid JSON: "
            '{"summary": "<summary>", "patch": "<diff or \'No file changes.\'">'
            "}"
        )
    )
    human = HumanMessage(
        content=(
            f"Task: {state['prompt']}\n\n"
            f"Execution history:\n{history_text}"
        )
    )

    try:
        response = await llm.ainvoke([system, human])
        raw = response.content.strip()
        match = re.search(r"\{.*\}", raw, re.DOTALL)
        parsed = json.loads(match.group(0) if match else raw)
        summary = parsed.get("summary", raw)
        patch = parsed.get("patch", "No file changes.")
    except Exception as exc:
        summary = f"Agent completed with status: {state.get('status', 'unknown')}. Parse error: {exc}"
        patch = "No file changes."

    # Determine final success/failure.
    # max_retries_reached = agent did its best, treat as completed (not hard fail).
    eval_status = state.get("status", "")
    final_status = "completed" if eval_status in ("pass", "max_retries_reached") else "failed"

    return {
        "current_step": "finalize",
        "steps_completed": state.get("steps_completed", []) + ["evaluate"],
        "messages": [SystemMessage(content=f"[finalize] {summary}")],
        "final_summary": summary,
        "final_patch": patch,
        "status": final_status,
    }


# ─────────────────────────────────────────────────────────────────────────────
# helpers
# ─────────────────────────────────────────────────────────────────────────────

async def _call_log(log_callback: Callable, level: str, message: str) -> None:
    """Safely invoke log_callback whether sync or async."""
    try:
        result = log_callback(level, message)
        if hasattr(result, "__await__"):
            await result
    except Exception:
        pass
