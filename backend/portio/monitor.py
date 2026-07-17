"""Continuous serial monitor — streams to stdout until Ctrl+C."""

from __future__ import annotations

import os
import sys
import time

BACKEND_ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
if BACKEND_ROOT not in sys.path:
    sys.path.insert(0, BACKEND_ROOT)

import serial

from portio.colors import banner_line, colorize_line


def print_banner(port: str, baud: int, grep: str) -> None:
    print(banner_line("--- WS63 Serial Monitor ---"), flush=True)
    print(f"Port : {port}", flush=True)
    print(f"Baud : {baud}", flush=True)
    if grep:
        print(f"Filter: {grep}", flush=True)
    print(banner_line("Quit : Ctrl+C"), flush=True)
    print(banner_line("---------------------------"), flush=True)


def main() -> int:
    if len(sys.argv) < 3:
        print("usage: monitor.py PORT BAUD [GREP]", file=sys.stderr)
        return 2

    port = sys.argv[1]
    baud = int(sys.argv[2])
    grep = sys.argv[3] if len(sys.argv) > 3 else ""

    if not port.upper().startswith("COM"):
        port = f"COM{port}"

    print_banner(port, baud, grep)

    try:
        with serial.Serial(port, baud, timeout=0.2) as ser:
            buffer = ""
            while True:
                chunk = ser.read(ser.in_waiting or 1)
                if not chunk:
                    time.sleep(0.01)
                    continue
                buffer += chunk.decode("utf-8", errors="replace")
                while "\n" in buffer:
                    line, buffer = buffer.split("\n", 1)
                    line = line.rstrip("\r")
                    if grep and grep not in line:
                        continue
                    print(colorize_line(line), flush=True)
    except KeyboardInterrupt:
        print("\n--- monitor stopped ---", flush=True)
        return 0
    except serial.SerialException as exc:
        print(f"error: {exc}", file=sys.stderr, flush=True)
        return 3


if __name__ == "__main__":
    raise SystemExit(main())
