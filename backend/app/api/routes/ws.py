"""
WebSocket endpoint for real-time log streaming.

Endpoint:  WS /ws/runs/{run_id}/logs

On connect:
  1. Sends all existing logs for that run (from DB)
  2. Subscribes the socket to future log events
  3. Streams new logs as they arrive via LogManager.add_log()
"""
from __future__ import annotations

import asyncio
import json
from collections import defaultdict
from datetime import datetime
from typing import Dict, List

from fastapi import APIRouter, WebSocket, WebSocketDisconnect

from app.db.database import AsyncSessionLocal
from app.models.task import Log

router = APIRouter()


# ─────────────────────────────────────────────────────────────────────────────
# LogManager — singleton
# ─────────────────────────────────────────────────────────────────────────────

class LogManager:
    """
    Central log manager that:
    - Persists log entries to SQLite via async SQLAlchemy
    - Broadcasts new entries to all connected WebSocket subscribers for a run
    """

    def __init__(self) -> None:
        # run_id -> list of connected WebSocket clients
        self._subscribers: Dict[str, List[WebSocket]] = defaultdict(list)

    def subscribe(self, run_id: str, ws: WebSocket) -> None:
        self._subscribers[run_id].append(ws)

    def unsubscribe(self, run_id: str, ws: WebSocket) -> None:
        try:
            self._subscribers[run_id].remove(ws)
        except ValueError:
            pass
        if not self._subscribers[run_id]:
            del self._subscribers[run_id]

    async def add_log(
        self,
        run_id: str,
        level: str,
        message: str,
        db_session=None,
    ) -> None:
        """
        Save a log entry to the database and broadcast it to all WebSocket
        subscribers for the given run_id.

        Args:
            run_id:     The Run UUID.
            level:      One of info / error / agent / system.
            message:    Log message text.
            db_session: Optional SQLAlchemy AsyncSession. If None, a new
                        session is created internally.
        """
        timestamp = datetime.utcnow()

        # ── Persist to DB ──────────────────────────────────────────────────
        log_entry = Log(
            run_id=run_id,
            timestamp=timestamp,
            level=level,
            message=message,
        )

        if db_session is not None:
            db_session.add(log_entry)
            await db_session.flush()  # assigns PK
            log_id = log_entry.id
        else:
            async with AsyncSessionLocal() as session:
                session.add(log_entry)
                await session.flush()  # assigns PK before commit
                log_id = log_entry.id  # capture while session is open
                await session.commit()

        # ── Build broadcast payload (id required for client-side dedup) ───
        payload = json.dumps(
            {
                "id": log_id,
                "run_id": run_id,
                "timestamp": timestamp.isoformat(),
                "level": level,
                "message": message,
            }
        )

        # ── Broadcast to subscribers ───────────────────────────────────────
        dead: List[WebSocket] = []
        for ws in list(self._subscribers.get(run_id, [])):
            try:
                await ws.send_text(payload)
            except Exception:
                dead.append(ws)

        for ws in dead:
            self.unsubscribe(run_id, ws)

    def make_callback(self, run_id: str):
        """
        Returns an async callable(level, message) suitable for passing to
        agent nodes and tools as log_callback.
        """
        async def _callback(level: str, message: str) -> None:
            await self.add_log(run_id, level, message)

        return _callback


# Module-level singleton used by both the WebSocket endpoint and task routes
log_manager = LogManager()


# ─────────────────────────────────────────────────────────────────────────────
# WebSocket endpoint
# ─────────────────────────────────────────────────────────────────────────────

@router.websocket("/ws/runs/{run_id}/logs")
async def websocket_run_logs(websocket: WebSocket, run_id: str) -> None:
    """
    WebSocket endpoint that streams logs for a run in real time.

    Protocol:
    - Each message is a JSON object:
        {
          "run_id": "...",
          "timestamp": "ISO-8601",
          "level": "info|error|agent|system",
          "message": "..."
        }
    - A special {"type": "history_end"} message is sent after the backlog.
    - Connection stays open until the client disconnects.
    """
    await websocket.accept()

    # ── Send existing log history ──────────────────────────────────────────
    try:
        from sqlalchemy import select
        async with AsyncSessionLocal() as session:
            result = await session.execute(
                select(Log)
                .where(Log.run_id == run_id)
                .order_by(Log.timestamp.asc())
            )
            existing_logs = result.scalars().all()

        for log_entry in existing_logs:
            payload = json.dumps(
                {
                    "run_id": log_entry.run_id,
                    "timestamp": log_entry.timestamp.isoformat(),
                    "level": log_entry.level,
                    "message": log_entry.message,
                }
            )
            await websocket.send_text(payload)

        # Signal end of historical backlog
        await websocket.send_text(json.dumps({"type": "history_end", "run_id": run_id}))

    except Exception as exc:
        await websocket.send_text(
            json.dumps({"type": "error", "message": f"Failed to load history: {exc}"})
        )

    # ── Subscribe and keep alive ───────────────────────────────────────────
    log_manager.subscribe(run_id, websocket)
    try:
        # Keep connection open by reading (clients may send pings or close frames)
        while True:
            data = await websocket.receive_text()
            # Echo-back or ignore client messages; we only stream server -> client
            if data.strip().lower() in ("ping", "{}"):
                await websocket.send_text(json.dumps({"type": "pong"}))
    except WebSocketDisconnect:
        pass
    except Exception:
        pass
    finally:
        log_manager.unsubscribe(run_id, websocket)
