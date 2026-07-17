"""Windows-side serial worker invoked from WSL for COM ports."""

from __future__ import annotations

import json
import sys
import time

import serial


def main() -> int:
    if len(sys.argv) < 8:
        print(json.dumps({"error": "usage: win_worker.py action port baud timeout max_lines [text] [pattern]"}))
        return 2

    action = sys.argv[1]
    port = sys.argv[2]
    baud = int(sys.argv[3])
    timeout = float(sys.argv[4])
    max_lines = int(sys.argv[5])
    text = sys.argv[6] if len(sys.argv) > 6 else ""
    pattern = sys.argv[7] if len(sys.argv) > 7 else ""

    if not port.upper().startswith("COM"):
        port = f"COM{port}"

    try:
        with serial.Serial(port, baud, timeout=0.2) as ser:
            if action == "write":
                ser.write(text.encode("utf-8"))
                ser.flush()
                print(json.dumps({"ok": True}))
                return 0

            if action != "read":
                print(json.dumps({"error": f"unknown action: {action}"}))
                return 2

            deadline = time.time() + timeout
            lines = []
            buffer = ""
            while time.time() < deadline and len(lines) < max_lines:
                chunk = ser.read(ser.in_waiting or 1)
                if not chunk:
                    continue
                buffer += chunk.decode("utf-8", errors="replace")
                while "\n" in buffer:
                    line, buffer = buffer.split("\n", 1)
                    line = line.rstrip("\r")
                    lines.append(line)
                    if pattern and pattern in line:
                        print(json.dumps({"lines": lines}))
                        return 0
            print(json.dumps({"lines": lines}))
            return 0
    except serial.SerialException as exc:
        print(json.dumps({"error": str(exc)}))
        return 3


if __name__ == "__main__":
    raise SystemExit(main())
