import uuid
from datetime import datetime
from typing import List, Optional

from sqlalchemy import String, DateTime, ForeignKey, Integer, Text
from sqlalchemy.orm import Mapped, mapped_column, relationship

from app.db.database import Base
from pydantic import BaseModel, ConfigDict


# ─────────────────────────────────────────────
# SQLAlchemy ORM Models
# ─────────────────────────────────────────────

def _now() -> datetime:
    return datetime.utcnow()


def _uuid() -> str:
    return str(uuid.uuid4())


class Task(Base):
    __tablename__ = "tasks"

    id: Mapped[str] = mapped_column(String(36), primary_key=True, default=_uuid)
    title: Mapped[str] = mapped_column(String(255), nullable=False)
    prompt: Mapped[str] = mapped_column(Text, nullable=False)
    repo_url: Mapped[Optional[str]] = mapped_column(String(512), nullable=True)
    snapshot_template: Mapped[str] = mapped_column(String(64), default="ubuntu-22", nullable=False)
    status: Mapped[str] = mapped_column(String(32), default="pending", nullable=False)
    created_at: Mapped[datetime] = mapped_column(DateTime, default=_now, nullable=False)
    updated_at: Mapped[datetime] = mapped_column(DateTime, default=_now, onupdate=_now, nullable=False)

    runs: Mapped[List["Run"]] = relationship(
        "Run", back_populates="task", cascade="all, delete-orphan", lazy="selectin"
    )


class Run(Base):
    __tablename__ = "runs"

    id: Mapped[str] = mapped_column(String(36), primary_key=True, default=_uuid)
    task_id: Mapped[str] = mapped_column(String(36), ForeignKey("tasks.id", ondelete="CASCADE"), nullable=False)
    sandbox_id: Mapped[Optional[str]] = mapped_column(String(256), nullable=True)
    preview_url: Mapped[Optional[str]] = mapped_column(String(512), nullable=True)
    agent_step: Mapped[Optional[str]] = mapped_column(String(128), nullable=True)
    summary: Mapped[Optional[str]] = mapped_column(Text, nullable=True)
    patch: Mapped[Optional[str]] = mapped_column(Text, nullable=True)
    status: Mapped[str] = mapped_column(String(32), default="pending", nullable=False)
    created_at: Mapped[datetime] = mapped_column(DateTime, default=_now, nullable=False)
    updated_at: Mapped[datetime] = mapped_column(DateTime, default=_now, onupdate=_now, nullable=False)

    task: Mapped["Task"] = relationship("Task", back_populates="runs")
    logs: Mapped[List["Log"]] = relationship(
        "Log", back_populates="run", cascade="all, delete-orphan", lazy="noload"
    )


class Log(Base):
    __tablename__ = "logs"

    id: Mapped[int] = mapped_column(Integer, primary_key=True, autoincrement=True)
    run_id: Mapped[str] = mapped_column(String(36), ForeignKey("runs.id", ondelete="CASCADE"), nullable=False)
    timestamp: Mapped[datetime] = mapped_column(DateTime, default=_now, nullable=False)
    level: Mapped[str] = mapped_column(String(32), default="info", nullable=False)
    message: Mapped[str] = mapped_column(Text, nullable=False)

    run: Mapped["Run"] = relationship("Run", back_populates="logs")


# ─────────────────────────────────────────────
# Pydantic Schemas
# ─────────────────────────────────────────────

class TaskCreate(BaseModel):
    title: str
    prompt: str
    repo_url: Optional[str] = None
    snapshot_template: str = "ubuntu-22"


class LogRead(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: int
    run_id: str
    timestamp: datetime
    level: str
    message: str


class RunReadBrief(BaseModel):
    """Run schema without logs — used when nested inside TaskRead to avoid
    triggering a lazy-load outside an async greenlet context."""
    model_config = ConfigDict(from_attributes=True)

    id: str
    task_id: str
    sandbox_id: Optional[str] = None
    preview_url: Optional[str] = None
    agent_step: Optional[str] = None
    summary: Optional[str] = None
    patch: Optional[str] = None
    status: str
    created_at: datetime
    updated_at: datetime


class RunRead(RunReadBrief):
    """Full run schema with logs — used on /api/runs/{id} endpoints."""
    logs: List[LogRead] = []


class TaskRead(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: str
    title: str
    prompt: str
    repo_url: Optional[str] = None
    snapshot_template: str
    status: str
    created_at: datetime
    updated_at: datetime
    runs: List[RunReadBrief] = []
