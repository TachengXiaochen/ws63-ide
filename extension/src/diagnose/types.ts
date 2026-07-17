/** Shared error codes for Doctor / Flash / Monitor preflight. */

export type CheckStatus = "ok" | "warn" | "fail";

export type ErrorCode =
  | "BACKEND_MISSING"
  | "SDK_MISSING"
  | "SDK_INVALID"
  | "FIRMWARE_MISSING"
  | "TOOL_MISSING"
  | "DEPS_MISSING"
  | "PORT_MISSING"
  | "PORT_NONE"
  | "PORT_BUSY"
  | "PORT_SCAN_FAILED"
  | "WIN_PYTHON_MISSING"
  | "STALE_PATH"
  | "RESET_TIMEOUT"
  | "UNKNOWN";

export interface DoctorCheck {
  id: string;
  status: CheckStatus;
  message: string;
  value?: string;
  fix?: string;
  code?: string;
}

export interface DoctorReport {
  version: number;
  overall: CheckStatus;
  summary: { ok: number; warn: number; fail: number };
  ide_root?: string;
  backend_root?: string;
  checks: DoctorCheck[];
}

export const ERROR_HINTS: Record<ErrorCode, string> = {
  BACKEND_MISSING: "Reinstall the WS63 IDE VSIX (backend should be bundled).",
  SDK_MISSING: "Open the SDK folder that contains build.py, or set ws63.sdkPath.",
  SDK_INVALID: "ws63.sdkPath does not contain build.py — clear it and reopen the SDK.",
  FIRMWARE_MISSING: "Run Build first, then Flash.",
  TOOL_MISSING: "ws63flash missing — reinstall VSIX or keep tools/ws63-ide/third_party.",
  DEPS_MISSING: "Run: pip3 install -r <backend>/requirements.txt",
  PORT_MISSING: "Use WS63: Select Port, or plug in USB.",
  PORT_NONE: "No COM ports seen — check USB cable / driver.",
  PORT_BUSY: "Close SSCOM, BurnTool, Monitor, or Debug Console occupying the port.",
  PORT_SCAN_FAILED: "Port scan failed — check pyserial and win_python on WSL.",
  WIN_PYTHON_MISSING:
    "COM* needs Windows Python from WSL. Settings → Win Python, or Select Port → /dev/ttyUSB*. Not a Python version issue.",
  STALE_PATH: "Clear old absolute paths in WS63 Settings.",
  RESET_TIMEOUT: "Press RST when prompted; replug USB if still stuck.",
  UNKNOWN: "See WS63 Output channel for details.",
};

export function hintForCode(code?: string): string {
  if (!code) {
    return ERROR_HINTS.UNKNOWN;
  }
  return ERROR_HINTS[code as ErrorCode] ?? ERROR_HINTS.UNKNOWN;
}

export function classifyFlashFailure(stdout: string, stderr: string, code: number): ErrorCode {
  const text = `${stdout}\n${stderr}`;
  if (code === 124 || /timed out/i.test(text)) {
    return "RESET_TIMEOUT";
  }
  if (/PermissionError|Access is denied|port.*busy|could not open/i.test(text)) {
    return "PORT_BUSY";
  }
  if (/No such device|open:|not found.*COM/i.test(text)) {
    return "PORT_MISSING";
  }
  if (/firmware not found/i.test(text)) {
    return "FIRMWARE_MISSING";
  }
  if (/ws63flash not found/i.test(text)) {
    return "TOOL_MISSING";
  }
  return "UNKNOWN";
}
