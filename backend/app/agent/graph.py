"""
LangGraph StateGraph definition for the AI Dev Workspace agent.

Graph topology:
  intake -> plan -> execute -> evaluate
  evaluate -> finalize  (if status == "pass" or "max_retries_reached" or "failed")
  evaluate -> retry -> execute  (if status == "fail")
"""
from __future__ import annotations

import asyncio
from typing import Callable, Optional

from langgraph.graph import StateGraph, END

from app.agent.state import AgentState
from app.agent.nodes import (
    intake_node,
    plan_node,
    evaluate_node,
    retry_node,
    finalize_node,
    make_execute_node,
)


def _evaluate_router(state: AgentState) -> str:
    """Route after evaluate_node based on status."""
    status = state.get("status", "")
    if status in ("pass", "max_retries_reached", "failed"):
        return "finalize"
    return "retry"


async def build_graph(sandbox, log_callback: Optional[Callable] = None) -> StateGraph:
    """
    Build and compile the LangGraph agent graph.

    Args:
        sandbox: Daytona sandbox object (already created).
        log_callback: async callable(level: str, message: str) for streaming logs.

    Returns:
        Compiled LangGraph app ready to invoke.
    """
    # Create the execute_node bound to this sandbox
    execute_node = await make_execute_node(sandbox, log_callback=log_callback)

    graph = StateGraph(AgentState)

    # Add nodes
    graph.add_node("intake", intake_node)
    graph.add_node("plan", plan_node)
    graph.add_node("execute", execute_node)
    graph.add_node("evaluate", evaluate_node)
    graph.add_node("retry", retry_node)
    graph.add_node("finalize", finalize_node)

    # Set entry point
    graph.set_entry_point("intake")

    # Add edges
    graph.add_edge("intake", "plan")
    graph.add_edge("plan", "execute")
    graph.add_edge("execute", "evaluate")

    # Conditional edge from evaluate
    graph.add_conditional_edges(
        "evaluate",
        _evaluate_router,
        {
            "finalize": "finalize",
            "retry": "retry",
        },
    )

    graph.add_edge("retry", "execute")
    graph.add_edge("finalize", END)

    return graph.compile()


async def run_agent(
    state: AgentState,
    sandbox,
    log_callback: Optional[Callable] = None,
) -> AgentState:
    """
    Build the graph and run the full agent pipeline.

    Args:
        state:         Initial AgentState (must include task_id, run_id, prompt, sandbox_id, etc.).
        sandbox:       Live Daytona sandbox object.
        log_callback:  async callable(level, message) for live log streaming.

    Returns:
        Final AgentState after the pipeline completes.
    """
    app = await build_graph(sandbox, log_callback=log_callback)

    if log_callback:
        try:
            result = log_callback("system", "[graph] Starting agent pipeline…")
            if asyncio.iscoroutine(result):
                await result
        except Exception:
            pass

    final_state: AgentState = await app.ainvoke(state)

    if log_callback:
        try:
            final_status = final_state.get("status", "unknown")
            result = log_callback("system", f"[graph] Pipeline finished with status: {final_status}")
            if asyncio.iscoroutine(result):
                await result
        except Exception:
            pass

    return final_state
