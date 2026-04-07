"""
DaytonaManager — thin async wrapper around the (synchronous) Daytona Python SDK.

All blocking SDK calls are dispatched to a thread-pool executor via
asyncio.get_event_loop().run_in_executor() so the FastAPI event loop is
never blocked.
"""
from __future__ import annotations

import asyncio
import importlib
import sys
from pathlib import Path
from typing import Optional, Tuple

try:
    from daytona import (
        Daytona,
        DaytonaConfig,
        CreateSandboxFromSnapshotParams,
        CreateSandboxFromImageParams,
        Image,
    )
except ImportError:
    sdk_src = Path(__file__).resolve().parents[3] / "daytona" / "libs" / "sdk-python" / "src"
    if sdk_src.exists() and str(sdk_src) not in sys.path:
        sys.path.insert(0, str(sdk_src))
    sys.modules.pop("daytona", None)
    daytona_module = importlib.import_module("daytona")
    Daytona = daytona_module.Daytona
    DaytonaConfig = daytona_module.DaytonaConfig
    CreateSandboxFromSnapshotParams = daytona_module.CreateSandboxFromSnapshotParams
    CreateSandboxFromImageParams = daytona_module.CreateSandboxFromImageParams
    Image = daytona_module.Image

# Map UI template names → Docker Hub image tags
_TEMPLATE_IMAGES: dict[str, str] = {
    "ubuntu-22":   "ubuntu:22.04",
    "ubuntu-20":   "ubuntu:20.04",
    "python-3.11": "python:3.11-slim",
    "node-20":     "node:20-slim",
}

from app.config import Settings


class DaytonaManager:
    def __init__(self, config: Settings) -> None:
        self._config = config
        self.daytona = Daytona(
            DaytonaConfig(
                api_key=config.daytona_api_key,
                api_url=config.daytona_api_url,
                target=config.daytona_target,
            )
        )

    # ─────────────────────────────────────────────────────────────────────────
    # Internal helper
    # ─────────────────────────────────────────────────────────────────────────

    async def _run_sync(self, func, *args, **kwargs):
        """Run a blocking function in the default thread-pool executor."""
        loop = asyncio.get_event_loop()
        return await loop.run_in_executor(
            None,
            lambda: func(*args, **kwargs),
        )

    # ─────────────────────────────────────────────────────────────────────────
    # Public API
    # ─────────────────────────────────────────────────────────────────────────

    async def create_sandbox(self, snapshot: str = "ubuntu-22") -> Tuple[str, object]:
        """
        Create a new Daytona sandbox.

        If `snapshot` matches a known template key (e.g. "ubuntu-22"), the sandbox
        is created from the corresponding Docker image via CreateSandboxFromImageParams.
        Otherwise it is treated as a snapshot name and CreateSandboxFromSnapshotParams
        is used (requires the snapshot to exist in the Daytona Dashboard).

        Returns:
            (sandbox_id, sandbox_object)
        """
        if snapshot in _TEMPLATE_IMAGES:
            docker_image = _TEMPLATE_IMAGES[snapshot]
            params = CreateSandboxFromImageParams(image=Image.base(docker_image))
        else:
            params = CreateSandboxFromSnapshotParams(snapshot=snapshot)

        sandbox = await self._run_sync(self.daytona.create, params)
        sandbox_id: str = sandbox.id
        return sandbox_id, sandbox

    async def get_sandbox(self, sandbox_id: str) -> object:
        """
        Retrieve an existing sandbox by ID or name.

        Returns:
            sandbox object
        """
        sandbox = await self._run_sync(self.daytona.get, sandbox_id)
        return sandbox

    async def delete_sandbox(self, sandbox_id: str) -> None:
        """
        Delete a sandbox by ID. Fetches the sandbox object first then deletes it.
        """
        try:
            sandbox = await self.get_sandbox(sandbox_id)
            await self._run_sync(self.daytona.delete, sandbox)
        except Exception:
            # Best-effort cleanup — swallow all errors
            pass

    async def get_preview_url(self, sandbox: object, port: int = 3000) -> Optional[str]:
        """
        Return the public preview URL for the given port on the sandbox.
        Uses sandbox.get_preview_link(port) which returns a PortPreviewUrl with .url and .token.

        Returns:
            URL string or None if unavailable.
        """
        try:
            preview_info = await self._run_sync(sandbox.get_preview_link, port)
            if preview_info and hasattr(preview_info, "url"):
                return preview_info.url
        except Exception:
            pass
        return None
