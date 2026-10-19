"""Run a lit-pptx or lit-docx helper inside the LitMuse office runtime.

The helpers are invoked as ``python3 <installed skill>/scripts/<helper>.py``.
Host Python usually lacks python-pptx, python-docx and the rest, so each helper
calls ``ensure_runtime()`` before its third-party imports. The runtime is
ensured through ``office-runtime.mjs python`` (first use installs the pinned
lockfile into a LitMuse-owned virtual environment) and the helper re-executes
itself under that interpreter with the same arguments.
"""

from __future__ import annotations

import importlib.util
import os
import subprocess
import sys

_REEXEC_MARK = "LITMUSE_OFFICE_REEXEC"
_RUNTIME = os.path.join(os.path.dirname(os.path.abspath(__file__)), "office-runtime.mjs")


def reexec(interpreter: str, script: str, args: list[str], env: dict, platform: str | None = None, execve=None, call=None) -> None:
    """Run ``script`` under ``interpreter`` and end this process with its outcome.

    POSIX replaces the process with execve. On Windows ``os.execve`` starts the new process and
    exits the parent at once with status 0, so a failing helper would still report success; there
    the child is run to completion and its exit code is returned.
    """
    if (platform or sys.platform) == "win32":
        sys.exit((call or subprocess.call)([interpreter, script, *args], env=env))
    (execve or os.execve)(interpreter, [interpreter, script, *args], env)


def _missing(modules: list[str]) -> list[str]:
    return [name for name in modules if importlib.util.find_spec(name) is None]


def ensure_runtime(modules: list[str]) -> None:
    """Re-execute under the pinned runtime interpreter unless already inside it.

    Host packages are not trusted to match the pinned versions, so the runtime is
    used even when the imports would succeed on the host. The host is a fallback
    only when the runtime cannot be prepared (offline, no node) and the host
    already has every module; that is said on stderr.
    """
    if os.environ.get(_REEXEC_MARK) == "1":
        missing = _missing(modules)
        if missing:
            raise SystemExit(
                "BLOCKED: the LitMuse office runtime is active but still lacks "
                + ", ".join(missing)
                + ". Run `node " + _RUNTIME + " status` and reinstall LitMuse if a pinned package is missing."
            )
        return
    node = os.environ.get("LITMUSE_NODE", "node")
    try:
        result = subprocess.run([node, _RUNTIME, "python"], stdout=subprocess.PIPE, stderr=None, text=True, check=False)
        interpreter = result.stdout.strip() if result.returncode == 0 else ""
        if result.returncode != 0:
            print(f"LitMuse office runtime: `{node} office-runtime.mjs python` exited {result.returncode}.", file=sys.stderr)
    except FileNotFoundError:
        print(f"LitMuse office runtime: `{node}` was not found on PATH (set LITMUSE_NODE to its full path).", file=sys.stderr)
        interpreter = ""
    if not interpreter:
        missing = _missing(modules)
        if not missing:
            print("LitMuse office runtime unavailable; continuing with the host Python packages.", file=sys.stderr)
            return
        raise SystemExit(
            "BLOCKED: the LitMuse office runtime could not be prepared and the host Python lacks "
            + ", ".join(missing)
            + " (see the message above)."
        )
    env = dict(os.environ, **{_REEXEC_MARK: "1", "PYTHONDONTWRITEBYTECODE": "1"})
    script = os.path.abspath(sys.argv[0])
    reexec(interpreter, script, sys.argv[1:], env)
