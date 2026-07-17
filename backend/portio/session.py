"""Serial session — Linux /dev/* and Windows COM via proxy."""

from __future__ import annotations

import json
import os
import subprocess
import sys
import time
from dataclasses import dataclass
from typing import Callable, List, Optional

try:
    import serial
    import serial.tools.list_ports
except ImportError as exc:
    raise SystemExit("pyserial required: pip install pyserial") from exc

from core.paths import is_wsl
from portio.colors import banner_line, colorize_line
from portio.win_python import com_port_help, detect_win_python


def is_com_port(port: str) -> bool:
    upper = port.upper()
    return upper.startswith("COM") or upper.startswith(r"\\.\COM")


def normalize_port(port: str) -> str:
    upper = port.upper()
    if upper.startswith(r"\\.\COM"):
        return upper.replace(r"\\.", "")
    return port


@dataclass
class PortInfo:
    device: str
    description: str
    backend: str


def list_ports(win_python: str) -> List[PortInfo]:
    ports: List[PortInfo] = []
    for item in serial.tools.list_ports.comports():
        ports.append(PortInfo(item.device, item.description or "unknown", "linux"))

    wp = detect_win_python(win_python)
    if is_wsl() and wp and os.path.isfile(wp):
        script = (
            "import json,serial.tools.list_ports;"
            "print(json.dumps([{'device':p.device,'description':p.description or ''} "
            "for p in serial.tools.list_ports.comports()]))"
        )
        result = subprocess.run(
            [wp, "-c", script],
            capture_output=True,
            text=True,
            encoding="utf-8",
            errors="replace",
            check=False,
        )
        if result.returncode == 0 and result.stdout.strip():
            for item in json.loads(result.stdout):
                ports.append(PortInfo(item["device"], item["description"], "windows"))

    seen = set()
    unique: List[PortInfo] = []
    for port in ports:
        key = port.device.upper()
        if key in seen:
            continue
        seen.add(key)
        unique.append(port)
    return unique


class SerialSession:
    def __init__(self, port: str, baud: int, win_python: str):
        self.port = normalize_port(port)
        self.baud = baud
        self.win_python = detect_win_python(win_python)
        self._ser: Optional[serial.Serial] = None
        self._use_win_proxy = (
            is_wsl() and is_com_port(self.port) and bool(self.win_python)
        )

    def _require_openable(self) -> None:
        if is_com_port(self.port) and not self._use_win_proxy:
            raise RuntimeError(
                com_port_help(self.port, self.win_python, wsl=is_wsl())
            )

    def __enter__(self) -> "SerialSession":
        self._require_openable()
        if self._use_win_proxy:
            return self
        self._ser = serial.Serial(self.port, self.baud, timeout=0.2)
        return self

    def __exit__(self, exc_type, exc, tb) -> None:
        if self._ser and self._ser.is_open:
            self._ser.close()

    def _win_worker(self, action: str, timeout: float, max_lines: int, text: str = "", pattern: str = "") -> dict:
        worker = os.path.join(os.path.dirname(__file__), "win_worker.py")
        cmd = [
            self.win_python,
            worker,
            action,
            self.port,
            str(self.baud),
            str(timeout),
            str(max_lines),
            text,
            pattern,
        ]
        result = subprocess.run(
            cmd,
            capture_output=True,
            text=True,
            encoding="utf-8",
            errors="replace",
            check=False,
        )
        if result.returncode != 0 and not result.stdout.strip():
            raise RuntimeError(result.stderr.strip() or f"serial worker failed ({result.returncode})")
        try:
            payload = json.loads(result.stdout or "{}")
        except json.JSONDecodeError as exc:
            raise RuntimeError(f"serial worker bad output: {result.stdout[:200]!r}") from exc
        if payload.get("error"):
            raise RuntimeError(payload["error"])
        return payload

    def read_lines(
        self,
        timeout: float,
        max_lines: int = 200,
        pattern: Optional[str] = None,
        on_line: Optional[Callable[[str], None]] = None,
    ) -> List[str]:
        if self._use_win_proxy:
            payload = self._win_worker("read", timeout, max_lines, pattern=pattern or "")
            lines = payload.get("lines", [])
            for line in lines:
                if on_line:
                    on_line(line)
            return lines

        assert self._ser is not None
        deadline = time.time() + timeout
        lines: List[str] = []
        buffer = ""
        while time.time() < deadline and len(lines) < max_lines:
            chunk = self._ser.read(self._ser.in_waiting or 1)
            if not chunk:
                continue
            buffer += chunk.decode("utf-8", errors="replace")
            while "\n" in buffer:
                line, buffer = buffer.split("\n", 1)
                line = line.rstrip("\r")
                lines.append(line)
                if on_line:
                    on_line(line)
                if pattern and pattern in line:
                    return lines
        return lines

    def write(self, data: str) -> None:
        if self._use_win_proxy:
            self._win_worker("write", 1.0, 0, text=data)
            return
        assert self._ser is not None
        self._ser.write(data.encode("utf-8"))
        self._ser.flush()

    def monitor(self, duration: float, pattern: Optional[str] = None) -> List[str]:
        def printer(line: str) -> None:
            print(colorize_line(line), flush=True)

        return self.read_lines(duration, max_lines=100000, pattern=pattern, on_line=printer)

    def monitor_forever(self, pattern: Optional[str] = None) -> int:
        self._require_openable()
        if self._use_win_proxy:
            worker = os.path.join(os.path.dirname(__file__), "monitor.py")
            cmd = [self.win_python, worker, self.port, str(self.baud)]
            if pattern:
                cmd.append(pattern)
            return subprocess.run(cmd, check=False).returncode

        if self._ser is None:
            self._ser = serial.Serial(self.port, self.baud, timeout=0.2)
        print(banner_line("--- WS63 Serial Monitor ---"), flush=True)
        print(f"Port : {self.port}", flush=True)
        print(f"Baud : {self.baud}", flush=True)
        if pattern:
            print(f"Filter: {pattern}", flush=True)
        print(banner_line("Quit : Ctrl+C"), flush=True)
        print(banner_line("---------------------------"), flush=True)
        buffer = ""
        try:
            while True:
                chunk = self._ser.read(self._ser.in_waiting or 1)
                if not chunk:
                    time.sleep(0.01)
                    continue
                buffer += chunk.decode("utf-8", errors="replace")
                while "\n" in buffer:
                    line, buffer = buffer.split("\n", 1)
                    line = line.rstrip("\r")
                    if pattern and pattern not in line:
                        continue
                    print(colorize_line(line), flush=True)
        except KeyboardInterrupt:
            print("\n--- monitor stopped ---", flush=True)
            return 0

    def console_forever(self) -> int:
        """Interactive console: stdin lines are sent to the serial port."""
        self._require_openable()
        if self._use_win_proxy:
            worker = os.path.join(os.path.dirname(__file__), "console.py")
            cmd = [self.win_python, worker, self.port, str(self.baud)]
            return subprocess.run(cmd, stdin=sys.stdin, check=False).returncode

        import threading

        if self._ser is None:
            self._ser = serial.Serial(self.port, self.baud, timeout=0.2)

        stop = threading.Event()

        def _reader() -> None:
            assert self._ser is not None
            buf = ""
            while not stop.is_set():
                chunk = self._ser.read(self._ser.in_waiting or 1)
                if not chunk:
                    time.sleep(0.01)
                    continue
                buf += chunk.decode("utf-8", errors="replace")
                while "\n" in buf:
                    line, buf = buf.split("\n", 1)
                    line = line.rstrip("\r")
                    if line:
                        print(colorize_line(line), flush=True)

        print(banner_line("--- WS63 Serial Console ---"), flush=True)
        print(f"Port : {self.port}", flush=True)
        print(f"Baud : {self.baud}", flush=True)
        print("Type a command and press Enter to send. Lines end with CRLF.", flush=True)
        print(banner_line("Quit : Ctrl+C or Ctrl+D"), flush=True)
        print(banner_line("---------------------------"), flush=True)

        thread = threading.Thread(target=_reader, daemon=True)
        thread.start()
        try:
            for line in sys.stdin:
                text = line.rstrip("\r\n")
                if not text:
                    continue
                assert self._ser is not None
                self._ser.write((text + "\r\n").encode("utf-8"))
                self._ser.flush()
                print(f">> {text}", flush=True)
        except KeyboardInterrupt:
            print("\n--- console stopped ---", flush=True)
            return 0
        finally:
            stop.set()
        return 0
