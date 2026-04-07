import asyncio
from typing import Callable, List, Optional
from functools import partial

from langchain_core.tools import tool


def make_daytona_tools(sandbox, log_callback: Optional[Callable] = None) -> List:
    """
    Returns a list of LangChain tools bound to a specific Daytona sandbox.

    Each tool wraps a sandbox operation. If log_callback is provided it will
    be called with (level: str, message: str) on every operation so the
    caller can stream progress to the client.
    """
    # Capture the running event loop at creation time (we are inside an async
    # context when make_daytona_tools is called). Tools themselves are called
    # synchronously by LangChain, possibly from a worker thread, so we must
    # schedule async callbacks back onto this loop via run_coroutine_threadsafe.
    try:
        _main_loop: Optional[asyncio.AbstractEventLoop] = asyncio.get_running_loop()
    except RuntimeError:
        _main_loop = None

    def _log(level: str, message: str) -> None:
        if not log_callback:
            return
        try:
            result = log_callback(level, message)
            if asyncio.iscoroutine(result):
                if _main_loop is not None and _main_loop.is_running():
                    # Schedule the coroutine on the main event loop from any thread.
                    asyncio.run_coroutine_threadsafe(result, _main_loop)
                else:
                    # Fallback: close the coroutine cleanly so Python doesn't warn.
                    result.close()
        except Exception:
            pass

    def _run_sync(coro):
        """Run an async coroutine synchronously, or return result if it's already sync."""
        if asyncio.iscoroutine(coro):
            try:
                loop = asyncio.get_event_loop()
                if loop.is_running():
                    import concurrent.futures
                    future = asyncio.run_coroutine_threadsafe(coro, loop)
                    return future.result(timeout=120)
                else:
                    return loop.run_until_complete(coro)
            except RuntimeError:
                return asyncio.run(coro)
        return coro

    @tool
    def read_file(path: str) -> str:
        """Read the contents of a file at the given path inside the sandbox."""
        _log("agent", f"[tool:read_file] {path}")
        try:
            content_bytes = sandbox.fs.download_file(path)
            if isinstance(content_bytes, bytes):
                return content_bytes.decode("utf-8", errors="replace")
            return str(content_bytes)
        except Exception as exc:
            error_msg = f"Error reading file {path}: {exc}"
            _log("error", error_msg)
            return error_msg

    @tool
    def write_file(path: str, content: str) -> str:
        """Write content to a file at the given path inside the sandbox.
        Creates parent directories automatically if they don't exist."""
        _log("agent", f"[tool:write_file] {path} ({len(content)} bytes)")
        try:
            # Daytona SDK: upload_file(content_bytes, remote_path)
            sandbox.fs.upload_file(content.encode("utf-8"), path)
            return f"Successfully wrote {len(content)} bytes to {path}"
        except Exception as exc:
            error_msg = f"Error writing file {path}: {exc}"
            _log("error", error_msg)
            return error_msg

    @tool
    def exec_command(command: str) -> str:
        """Execute a shell command inside the sandbox and return combined stdout/stderr output.
        IMPORTANT: Each call is a fresh shell — environment variables, 'source', 'cd', and
        'export' do NOT persist between calls. Always use absolute paths and inline
        the full command (e.g. '/usr/bin/python3 script.py' or
        'cd /dir && python3 script.py' in a single call)."""
        _log("agent", f"[tool:exec_command] {command}")
        try:
            result = sandbox.process.exec(command)
            output_parts = []
            if hasattr(result, "result") and result.result:
                output_parts.append(result.result)
            exit_code = getattr(result, "exit_code", None)
            if exit_code is not None and exit_code != 0:
                output_parts.append(f"[exit_code={exit_code}]")
            output = "\n".join(output_parts) if output_parts else "(no output)"
            _log("info", f"Command output: {output[:500]}{'...' if len(output) > 500 else ''}")
            return output
        except Exception as exc:
            error_msg = f"Error executing command '{command}': {exc}"
            _log("error", error_msg)
            return error_msg

    @tool
    def list_files(path: str) -> str:
        """List files and directories at the given path inside the sandbox."""
        _log("agent", f"[tool:list_files] {path}")
        try:
            entries = sandbox.fs.list_files(path)
            if not entries:
                return f"(empty directory or path not found: {path})"
            lines = []
            for entry in entries:
                name = getattr(entry, "name", str(entry))
                is_dir = getattr(entry, "is_dir", False)
                size = getattr(entry, "size", None)
                prefix = "d " if is_dir else "f "
                size_str = f" ({size} bytes)" if size is not None and not is_dir else ""
                lines.append(f"{prefix}{name}{size_str}")
            return "\n".join(lines)
        except Exception as exc:
            error_msg = f"Error listing files at {path}: {exc}"
            _log("error", error_msg)
            return error_msg

    @tool
    def git_clone(repo_url: str, target_dir: str) -> str:
        """Clone a git repository from repo_url into target_dir inside the sandbox."""
        _log("agent", f"[tool:git_clone] {repo_url} -> {target_dir}")
        try:
            sandbox.git.clone(repo_url, target_dir)
            return f"Successfully cloned {repo_url} into {target_dir}"
        except Exception as exc:
            # Fallback: try via exec_command if git object unavailable
            _log("info", f"git.clone failed ({exc}), falling back to exec_command")
            try:
                result = sandbox.process.exec(f"git clone {repo_url} {target_dir}")
                output = getattr(result, "result", "") or ""
                exit_code = getattr(result, "exit_code", 0)
                if exit_code != 0:
                    return f"git clone failed (exit {exit_code}): {output}"
                return f"Successfully cloned {repo_url} into {target_dir}: {output}"
            except Exception as exc2:
                error_msg = f"Error cloning repo {repo_url}: {exc2}"
                _log("error", error_msg)
                return error_msg

    return [read_file, write_file, exec_command, list_files, git_clone]
