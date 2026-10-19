"""Check, before XeLaTeX starts, that the fonts a PDF profile names are installed.

fontspec looks fonts up by family name and stops with a long TeX log when one is absent. This
module reads the installed family names (fontconfig's ``fc-list`` where it exists, the Windows
font registry otherwise) and, when a needed font is missing, ends with a BLOCKED message that names
the font and says how to install it. When the installed set cannot be read, nothing is guessed and
nothing is blocked.
"""

from __future__ import annotations

import re
import shutil
import subprocess
import sys

_INSTALL_HINTS = {
    "pretendard": (
        "Install Pretendard (SIL OFL): https://github.com/orioncactus/pretendard/releases. "
        "The LitMuse bundle also carries Pretendard-Regular.otf and Pretendard-Bold.otf in skills/lit-pptx/fonts/pretendard/; "
        "copy them to your user fonts folder."
    ),
}
_GENERIC_HINT = "Install the font family, or change the family named by the profile in templates/registry.yaml."


def _norm(name: str) -> str:
    return re.sub(r"[\s_-]+", " ", name.strip().lower())


def parse_fc_list(text: str) -> set[str]:
    """Family names from ``fc-list : family`` output (one line per face, aliases comma-separated)."""
    names: set[str] = set()
    for line in re.split(r"\r?\n", text):
        for name in line.split(","):
            if name.strip():
                names.add(_norm(name))
    return names


_REG_KEYS = (r"HKLM\SOFTWARE\Microsoft\Windows NT\CurrentVersion\Fonts", r"HKCU\SOFTWARE\Microsoft\Windows NT\CurrentVersion\Fonts")
_REG_FONT = re.compile(r"^\s+(.+?) \((?:TrueType|OpenType)\)\s+REG_SZ\b", re.IGNORECASE)


def parse_reg_fonts(text: str) -> set[str]:
    """Face names from ``reg query`` of the Windows font keys, such as ``Times New Roman Bold (TrueType)``."""
    return {_norm(m.group(1)) for line in re.split(r"\r?\n", text) if (m := _REG_FONT.match(line))}


def installed_families(platform: str | None = None, which=shutil.which, run=subprocess.run) -> set[str] | None:
    """Installed family names, or None when this host offers no way to list them."""
    if which("fc-list"):
        result = run(["fc-list", ":", "family"], text=True, capture_output=True, check=False)
        if result.returncode == 0 and result.stdout.strip():
            return parse_fc_list(result.stdout)
    if (platform or sys.platform) == "win32":
        names: set[str] = set()
        for key in _REG_KEYS:
            result = run(["reg", "query", key], text=True, capture_output=True, check=False)
            if result.returncode == 0:
                names |= parse_reg_fonts(result.stdout)
        return names or None
    return None


def _has(family: str, installed: set[str]) -> bool:
    want = _norm(family)
    return any(have == want or have.startswith(want + " ") for have in installed)


def missing_fonts(needed: dict[str, str], installed: set[str] | None) -> list[tuple[str, str]]:
    """(role, family) pairs that are not installed; empty when the installed set is unknown."""
    if installed is None:
        return []
    return [(role, family) for role, family in needed.items() if family and not _has(family, installed)]


def block_message(missing: list[tuple[str, str]]) -> str:
    lines = ["BLOCKED: the PDF profile needs fonts that are not installed, so XeLaTeX would stop:"]
    for role, family in missing:
        hint = _INSTALL_HINTS.get(_norm(family), _GENERIC_HINT)
        lines.append(f"  - {role}: {family}. {hint}")
    return "\n".join(lines)


def require_fonts(needed: dict[str, str], installed: set[str] | None | str = "probe") -> None:
    """End with the BLOCKED message when a needed font is missing."""
    found = installed_families() if installed == "probe" else installed
    missing = missing_fonts(needed, found)  # type: ignore[arg-type]
    if missing:
        raise SystemExit(block_message(missing))
