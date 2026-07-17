"""WS63 firmware flashing via ws63flash (third_party)."""

from __future__ import annotations

import os
import re
import select
import signal
import subprocess
import time
from typing import Dict, List, Optional

from core.paths import is_wsl, resolve_ws63flash, wsl_to_win_path
from portio.session import normalize_port


def _clean_terminal_line(line: str) -> str:
    """Remove backspace overwrites from ws63flash progress output."""
    chars: list[str] = []
    for ch in line:
        if ch == "\b":
            if chars:
                chars.pop()
        elif ch != "\r":
            chars.append(ch)
    return "".join(chars)


def ws63flash_path(sdk_path: str = "") -> str:
    return resolve_ws63flash(sdk_path)


def resolve_firmware(path: str) -> str:
    if os.path.isfile(path):
        return os.path.abspath(path)
    raise FileNotFoundError(f"firmware not found: {path}")


def build_flash_command(
    port: str,
    firmware: str,
    baud: int,
    bins: Optional[List[str]] = None,
    sdk_path: str = "",
) -> List[str]:
    flash_bin = ws63flash_path(sdk_path)
    port = normalize_port(port)
    firmware = resolve_firmware(firmware)

    if is_wsl():
        flash_bin = wsl_to_win_path(flash_bin)
        firmware = wsl_to_win_path(firmware)
        cmd = ["cmd.exe", "/c", flash_bin, f"-b{baud}", "--flash", port, firmware]
        if bins:
            cmd.extend(bins)
        return cmd

    return [flash_bin, f"-b{baud}", "--flash", port, firmware, *(bins or [])]


def _kill_flash_process(proc: subprocess.Popen) -> None:
    if proc.poll() is not None:
        return
    try:
        proc.terminate()
        proc.wait(timeout=2)
    except subprocess.TimeoutExpired:
        proc.kill()
        try:
            proc.wait(timeout=2)
        except subprocess.TimeoutExpired:
            pass
    if is_wsl():
        subprocess.run(
            ["cmd.exe", "/c", "taskkill", "/F", "/IM", "ws63flash.exe"],
            capture_output=True,
            check=False,
        )


def _emit_xfer_progress(cleaned: str, last_pct: Dict[str, int]) -> None:
    """Emit lightweight progress markers while ws63flash updates with backspaces."""
    m = re.search(r"Xfer\s+(\S+).*?(\d+)%", cleaned)
    if not m:
        return
    file_name = m.group(1)
    pct = int(m.group(2))
    prev = last_pct.get(file_name, -1)
    if pct == prev:
        return
    if pct == 100 or pct - prev >= 5 or prev < 0:
        print(f"[ws63:progress] {file_name} {pct}", flush=True)
        last_pct[file_name] = pct


def _read_flash_char(
    proc: subprocess.Popen,
    buf: list[str],
    last_pct: Dict[str, int],
    state: Dict[str, Optional[float]],
) -> None:
    assert proc.stdout is not None
    ch = proc.stdout.read(1)
    if not ch:
        return
    if ch == "\n":
        cleaned = _clean_terminal_line("".join(buf))
        if cleaned.strip():
            print(cleaned, flush=True)
            if re.search(r"Done\.|Resetting device|Reseting device", cleaned, re.I):
                state["done_at"] = time.monotonic()
        buf.clear()
        return
    buf.append(ch)
    cleaned = _clean_terminal_line("".join(buf))
    _emit_xfer_progress(cleaned, last_pct)


def flash_firmware(
    port: str,
    firmware: str,
    baud: int = 921600,
    bins: Optional[List[str]] = None,
    timeout: int = 120,
) -> int:
    cmd = build_flash_command(port, firmware, baud, bins)
    print("[flash] command:", " ".join(cmd), flush=True)
    print("", flush=True)
    print("=" * 60, flush=True)
    print("  WS63 Flash — 请在出现 Waiting for device reset 后按 RST 复位", flush=True)
    print(f"  超时: {timeout}s | 可随时在 Cursor 点 Stop 或进度条取消", flush=True)
    print("=" * 60, flush=True)
    print("", flush=True)

    proc = subprocess.Popen(
        cmd,
        stdout=subprocess.PIPE,
        stderr=subprocess.STDOUT,
        text=True,
        encoding="utf-8",
        errors="replace",
        bufsize=1,
    )

    aborted = {"v": False}

    def _shutdown(_signum=None, _frame=None) -> None:
        aborted["v"] = True
        print("\n[flash] stopping...", flush=True)
        _kill_flash_process(proc)

    signal.signal(signal.SIGTERM, _shutdown)
    signal.signal(signal.SIGINT, _shutdown)

    start = time.monotonic()
    assert proc.stdout is not None
    buf: list[str] = []
    last_pct: Dict[str, int] = {}
    state: Dict[str, Optional[float]] = {"done_at": None}
    reset_grace_s = 8

    while True:
        if aborted["v"]:
            return 130

        if timeout > 0 and time.monotonic() - start > timeout:
            print(f"[flash] ERROR: timed out after {timeout}s", flush=True)
            print("[flash] hint: close SSCOM/BurnTool, replug USB, press RST, retry", flush=True)
            _kill_flash_process(proc)
            return 124

        done_at = state.get("done_at")
        if done_at and time.monotonic() - done_at > reset_grace_s:
            print("[flash] reset phase done (auto-close)", flush=True)
            _kill_flash_process(proc)
            return 0

        if proc.poll() is not None:
            while True:
                ready, _, _ = select.select([proc.stdout], [], [], 0.05)
                if not ready:
                    break
                _read_flash_char(proc, buf, last_pct, state)
            cleaned = _clean_terminal_line("".join(buf))
            if cleaned.strip():
                print(cleaned, flush=True)
            code = proc.returncode or 0
            return 0 if state.get("done_at") else code

        ready, _, _ = select.select([proc.stdout], [], [], 0.5)
        if ready:
            _read_flash_char(proc, buf, last_pct, state)
