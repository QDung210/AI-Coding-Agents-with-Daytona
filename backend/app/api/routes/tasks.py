"""
REST API routes for Tasks and Runs.

Endpoints:
  GET    /api/tasks               – list all tasks (with latest run status)
  POST   /api/tasks               – create task + trigger agent run
  GET    /api/tasks/{task_id}     – get task detail with all runs
  DELETE /api/tasks/{task_id}     – delete task + cleanup sandbox
  GET    /api/runs/{run_id}       – get run detail with logs
  GET    /api/runs/{run_id}/logs  – get all logs for a run
  POST   /api/runs/{run_id}/retry – retry a failed run
"""
from __future__ import annotations

import asyncio
import uuid
from datetime import datetime
from typing import List

from fastapi import APIRouter, Depends, HTTPException, Response, status
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from sqlalchemy.orm import selectinload

from app.db.database import get_db
from app.models.task import Task, Run, Log, TaskCreate, TaskRead, RunRead, LogRead
from app.config import get_settings
from app.daytona_manager.manager import DaytonaManager
from app.agent.graph import run_agent
from app.agent.state import AgentState
from app.api.routes.ws import log_manager

router = APIRouter()
settings = get_settings()


# ─────────────────────────────────────────────────────────────────────────────
# Shared helpers
# ─────────────────────────────────────────────────────────────────────────────

def _get_daytona_manager() -> DaytonaManager:
    return DaytonaManager(settings)


async def _get_task_or_404(task_id: str, db: AsyncSession) -> Task:
    result = await db.execute(select(Task).where(Task.id == task_id))
    task = result.scalar_one_or_none()
    if task is None:
        raise HTTPException(status_code=404, detail=f"Task {task_id} not found")
    return task


async def _get_run_or_404(run_id: str, db: AsyncSession) -> Run:
    result = await db.execute(select(Run).where(Run.id == run_id))
    run = result.scalar_one_or_none()
    if run is None:
        raise HTTPException(status_code=404, detail=f"Run {run_id} not found")
    return run


# ─────────────────────────────────────────────────────────────────────────────
# Background agent runner
# ─────────────────────────────────────────────────────────────────────────────

async def _run_agent_background(
    task_id: str,
    run_id: str,
    prompt: str,
    repo_url: str | None,
    snapshot_template: str,
) -> None:
    """
    Background coroutine that:
    1. Creates a Daytona sandbox
    2. Runs the LangGraph agent
    3. Updates Run record with final status/summary/patch
    """
    daytona_mgr = _get_daytona_manager()
    log_cb = log_manager.make_callback(run_id)

    # ── Helper to update Run record ────────────────────────────────────────
    async def _update_run(**kwargs) -> None:
        from app.db.database import AsyncSessionLocal
        async with AsyncSessionLocal() as session:
            result = await session.execute(select(Run).where(Run.id == run_id))
            run_obj = result.scalar_one_or_none()
            if run_obj:
                for key, val in kwargs.items():
                    setattr(run_obj, key, val)
                run_obj.updated_at = datetime.utcnow()
                await session.commit()

    async def _update_task_status(s: str) -> None:
        from app.db.database import AsyncSessionLocal
        async with AsyncSessionLocal() as session:
            result = await session.execute(select(Task).where(Task.id == task_id))
            task_obj = result.scalar_one_or_none()
            if task_obj:
                task_obj.status = s
                task_obj.updated_at = datetime.utcnow()
                await session.commit()

    sandbox_id: str | None = None

    try:
        # ── Step 1: Create sandbox ─────────────────────────────────────────
        await log_cb("system", f"[runner] Creating Daytona sandbox (snapshot={snapshot_template})…")
        await _update_run(status="running", agent_step="creating_sandbox")
        await _update_task_status("running")

        # Heartbeat — log every 10s while sandbox is provisioning so the UI
        # never shows a blank log for minutes at a time.
        _heartbeat_stop = asyncio.Event()

        async def _heartbeat() -> None:
            _messages = [
                "Pulling container image…",
                "Allocating resources…",
                "Starting runtime environment…",
                "Configuring sandbox…",
                "Almost ready…",
            ]
            elapsed = 0
            while not _heartbeat_stop.is_set():
                await asyncio.sleep(10)
                if _heartbeat_stop.is_set():
                    break
                elapsed += 10
                idx = min(elapsed // 10 - 1, len(_messages) - 1)
                await log_cb("system", f"[runner] {_messages[idx]} ({elapsed}s elapsed)")

        _hb_task = asyncio.create_task(_heartbeat())
        try:
            sandbox_id, sandbox = await daytona_mgr.create_sandbox(snapshot=snapshot_template)
        finally:
            _heartbeat_stop.set()
            _hb_task.cancel()
            try:
                await _hb_task
            except asyncio.CancelledError:
                pass

        await log_cb("system", f"[runner] Sandbox created: {sandbox_id}")
        await _update_run(sandbox_id=sandbox_id, agent_step="sandbox_ready")

        # ── Step 2: Build initial AgentState ──────────────────────────────
        # NOTE: preview_url is NOT fetched here. It is only meaningful once the
        # agent has started a web server. The agent should call get_preview_url
        # itself after starting a service, or finalize_node can fetch it.
        initial_state: AgentState = {
            "task_id": task_id,
            "run_id": run_id,
            "prompt": prompt,
            "repo_url": repo_url,
            "sandbox_id": sandbox_id,
            "working_dir": "/workspace/project",
            "messages": [],
            "steps_completed": [],
            "current_step": "init",
            "test_output": "",
            "retry_count": 0,
            "max_retries": 2,
            "final_summary": "",
            "final_patch": "",
            "preview_url": "",
            "error": None,
            "status": "running",
        }

        # Wrap log_cb to also update agent_step in DB
        async def _step_log_cb(level: str, message: str) -> None:
            await log_cb(level, message)
            # Parse current step from system messages
            if level == "system" and "[graph]" not in message:
                step = message.split("]")[0].lstrip("[") if "]" in message else None
                if step and len(step) < 50:
                    await _update_run(agent_step=step)

        # ── Step 3: Run the agent ──────────────────────────────────────────
        from app.agent.nodes import register_run_log, unregister_run_log
        register_run_log(run_id, _step_log_cb)
        try:
            final_state = await run_agent(initial_state, sandbox, log_callback=_step_log_cb)
        finally:
            unregister_run_log(run_id)

        # ── Step 4: Persist results ────────────────────────────────────────
        final_status = final_state.get("status", "failed")
        if final_status in ("pass", "completed"):
            db_status = "completed"
            task_status = "completed"
        else:
            db_status = "failed"
            task_status = "failed"

        # Try to get preview URL — only if a server is actually listening on the port
        final_preview_url: str | None = final_state.get("preview_url") or None
        if db_status == "completed" and not final_preview_url:
            _check_script = (
                "import socket,sys; s=socket.socket(); s.settimeout(2); "
                "r=s.connect_ex(('127.0.0.1',{port})); s.close(); sys.exit(0 if r==0 else 1)"
            )
            for port in (3000, 8000, 8080, 5000):
                try:
                    check = await asyncio.get_event_loop().run_in_executor(
                        None,
                        lambda p=port: sandbox.process.exec(
                            f"python3 -c \"{_check_script.format(port=p)}\""
                        ),
                    )
                    port_in_use = getattr(check, "exit_code", 1) == 0
                except Exception:
                    port_in_use = False

                if port_in_use:
                    url = await daytona_mgr.get_preview_url(sandbox, port=port)
                    if url:
                        final_preview_url = url
                        await log_cb("system", f"[runner] Preview URL (port {port}): {url}")
                        break
                else:
                    await log_cb("system", f"[runner] No server on port {port}.")

        await _update_run(
            status=db_status,
            summary=final_state.get("final_summary", ""),
            patch=final_state.get("final_patch", ""),
            preview_url=final_preview_url,
            agent_step="finalized",
            updated_at=datetime.utcnow(),
        )
        await _update_task_status(task_status)

        await log_cb("system", f"[runner] Run {run_id} finished with status: {db_status}")

    except Exception as exc:
        error_msg = str(exc)
        await log_cb("error", f"[runner] Fatal error: {error_msg}")
        await _update_run(status="failed", agent_step="error", updated_at=datetime.utcnow())
        await _update_task_status("failed")

        # Best-effort sandbox cleanup on hard failure
        if sandbox_id:
            try:
                await daytona_mgr.delete_sandbox(sandbox_id)
            except Exception:
                pass


# ─────────────────────────────────────────────────────────────────────────────
# Task endpoints
# ─────────────────────────────────────────────────────────────────────────────

@router.get("/api/tasks", response_model=List[TaskRead])
async def list_tasks(db: AsyncSession = Depends(get_db)) -> List[TaskRead]:
    """List all tasks, each with their runs (latest first)."""
    result = await db.execute(
        select(Task).order_by(Task.created_at.desc())
    )
    tasks = result.scalars().all()
    return [TaskRead.model_validate(t) for t in tasks]


@router.post("/api/tasks", response_model=TaskRead, status_code=status.HTTP_201_CREATED)
async def create_task(
    body: TaskCreate,
    db: AsyncSession = Depends(get_db),
) -> TaskRead:
    """
    Create a new task and immediately trigger an agent run in the background.
    """
    task_id = str(uuid.uuid4())
    run_id = str(uuid.uuid4())
    now = datetime.utcnow()

    # Create Task record
    task = Task(
        id=task_id,
        title=body.title,
        prompt=body.prompt,
        repo_url=body.repo_url,
        snapshot_template=body.snapshot_template,
        status="pending",
        created_at=now,
        updated_at=now,
    )
    db.add(task)

    # Create initial Run record
    run = Run(
        id=run_id,
        task_id=task_id,
        status="pending",
        created_at=now,
        updated_at=now,
    )
    db.add(run)
    # Commit before firing background task so the run record is visible
    # to the background session (avoids FK constraint errors on first log write)
    await db.commit()
    await db.refresh(task)

    # Kick off background agent — do NOT await, fire-and-forget
    asyncio.create_task(
        _run_agent_background(
            task_id=task_id,
            run_id=run_id,
            prompt=body.prompt,
            repo_url=body.repo_url,
            snapshot_template=body.snapshot_template,
        )
    )

    return TaskRead.model_validate(task)


@router.get("/api/tasks/{task_id}", response_model=TaskRead)
async def get_task(
    task_id: str,
    db: AsyncSession = Depends(get_db),
) -> TaskRead:
    """Get a task by ID, including all its runs."""
    task = await _get_task_or_404(task_id, db)
    return TaskRead.model_validate(task)


@router.delete(
    "/api/tasks/{task_id}",
    status_code=status.HTTP_204_NO_CONTENT,
    response_class=Response,
)
async def delete_task(
    task_id: str,
    db: AsyncSession = Depends(get_db),
) -> Response:
    """
    Delete a task (and all associated runs/logs). Also clean up any active sandboxes.
    """
    task = await _get_task_or_404(task_id, db)

    # Best-effort sandbox cleanup for each run
    daytona_mgr = _get_daytona_manager()
    for run in task.runs:
        if run.sandbox_id:
            asyncio.create_task(daytona_mgr.delete_sandbox(run.sandbox_id))

    await db.delete(task)
    await db.flush()
    return Response(status_code=status.HTTP_204_NO_CONTENT)


# ─────────────────────────────────────────────────────────────────────────────
# Run endpoints
# ─────────────────────────────────────────────────────────────────────────────

@router.get("/api/runs/{run_id}", response_model=RunRead)
async def get_run(
    run_id: str,
    db: AsyncSession = Depends(get_db),
) -> RunRead:
    """Get a run by ID, including its logs (explicitly eager-loaded)."""
    result = await db.execute(
        select(Run)
        .where(Run.id == run_id)
        .options(selectinload(Run.logs))
    )
    run = result.scalar_one_or_none()
    if run is None:
        raise HTTPException(status_code=404, detail=f"Run {run_id} not found")
    return RunRead.model_validate(run)


@router.get("/api/runs/{run_id}/logs", response_model=List[LogRead])
async def get_run_logs(
    run_id: str,
    db: AsyncSession = Depends(get_db),
) -> List[LogRead]:
    """Get all log entries for a run, ordered by timestamp."""
    await _get_run_or_404(run_id, db)  # validate run exists
    result = await db.execute(
        select(Log)
        .where(Log.run_id == run_id)
        .order_by(Log.timestamp.asc())
    )
    logs = result.scalars().all()
    return [LogRead.model_validate(log) for log in logs]


@router.post("/api/runs/{run_id}/retry", response_model=RunRead, status_code=status.HTTP_201_CREATED)
async def retry_run(
    run_id: str,
    db: AsyncSession = Depends(get_db),
) -> RunRead:
    """
    Retry a failed run. Creates a new Run record for the same task and
    triggers a fresh agent run.
    """
    original_run = await _get_run_or_404(run_id, db)

    if original_run.status not in ("failed", "completed"):
        raise HTTPException(
            status_code=400,
            detail=f"Run {run_id} has status '{original_run.status}' — only failed/completed runs can be retried.",
        )

    # Fetch parent task
    task = await _get_task_or_404(original_run.task_id, db)

    new_run_id = str(uuid.uuid4())
    now = datetime.utcnow()

    new_run = Run(
        id=new_run_id,
        task_id=task.id,
        status="pending",
        created_at=now,
        updated_at=now,
    )
    db.add(new_run)

    # Reset task status to running
    task.status = "pending"
    task.updated_at = now

    await db.flush()

    asyncio.create_task(
        _run_agent_background(
            task_id=task.id,
            run_id=new_run_id,
            prompt=task.prompt,
            repo_url=task.repo_url,
            snapshot_template=task.snapshot_template,
        )
    )

    await db.refresh(new_run)
    return RunRead.model_validate(new_run)
