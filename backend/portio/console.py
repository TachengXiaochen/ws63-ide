"""Interactive serial console — type commands, see device output (stdin → COM)."""

from __future__ import annotations

import os
import sys
import threading
import time

BACKEND_ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
if BACKEND_ROOT not in sys.path:
    sys.path.insert(0, BACKEND_ROOT)

import serial

from portio.colors import banner_line, colorize_line


def _reader(ser: serial.Serial, stop: threading.Event) -> None:
    buffer = ""
    while not stop.is_set():
        try:
            chunk = ser.read(ser.in_waiting or 1)
        except serial.SerialException:
            break
        if not chunk:
            time.sleep(0.01)
            continue
        buffer += chunk.decode("utf-8", errors="replace")
        while "\n" in buffer:
            line, buffer = buffer.split("\n", 1)
            line = line.rstrip("\r")
            if line:
                print(colorize_line(line), flush=True)


def print_banner(port: str, baud: int) -> None:
    print(banner_line("--- WS63 Serial Console ---"), flush=True)
    print(f"Port : {port}", flush=True)
    print(f"Baud : {baud}", flush=True)
    print("Type a command and press Enter to send. Lines end with CRLF.", flush=True)
    print("Quit : Ctrl+C or Ctrl+D", flush=True)
    print(banner_line("---------------------------"), flush=True)


def main() -> int:
    if len(sys.argv) < 3:
        print("usage: console.py PORT BAUD", file=sys.stderr)
        return 2

    port = sys.argv[1]
    baud = int(sys.argv[2])
    if not port.upper().startswith("COM"):
        port = f"COM{port}"

    print_banner(port, baud)

    stop = threading.Event()
    try:
        with serial.Serial(port, baud, timeout=0.2) as ser:
            thread = threading.Thread(target=_reader, args=(ser, stop), daemon=True)
            thread.start()
            for line in sys.stdin:
                text = line.rstrip("\r\n")
                if not text:
                    continue
                payload = (text + "\r\n").encode("utf-8")
                ser.write(payload)
                ser.flush()
                print(f">> {text}", flush=True)
    except KeyboardInterrupt:
        print("\n--- console stopped ---", flush=True)
        return 0
    except serial.SerialException as exc:
        print(f"error: {exc}", file=sys.stderr, flush=True)
        return 3
    finally:
        stop.set()

    return 0


if __name__ == "__main__":
    raise SystemExit(main())
