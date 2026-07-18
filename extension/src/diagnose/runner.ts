import * as fs from "fs";
import * as path from "path";
import { detectHostMode, hostModeLabel, probeWslWrap } from "../host/adapter";
import { backendClient } from "../host/backendClient";
import { cliPath, firmwareAbs, getSettings } from "../settings";
import {
  DoctorCheck,
  DoctorReport,
  ErrorCode,
  hintForCode,
} from "./types";

export async function runDoctorReport(): Promise<DoctorReport> {
  const s = getSettings();
  const result = await backendClient.doctor({
    sdk: s.sdkPath,
    port: s.port,
    firmwareRel: s.firmwareRel,
    target: s.target,
    winPython: s.winPython,
  });
  const raw = (result.stdout || "").trim();
  let report: DoctorReport | undefined;
  try {
    const start = raw.indexOf("{");
    const end = raw.lastIndexOf("}");
    if (start >= 0 && end > start) {
      report = JSON.parse(raw.slice(start, end + 1)) as DoctorReport;
    }
  } catch {
    /* fall through */
  }

  if (!report) {
    report = localFallbackReport(result.stderr || result.stdout || "doctor CLI failed");
  }

  // Extension-side host / stale checks (CLI may not see VS Code settings)
  report.checks = [...ideHostChecks(), ...report.checks];
  recomputeSummary(report);
  return report;
}

function ideHostChecks(): DoctorCheck[] {
  const s = getSettings();
  const checks: DoctorCheck[] = [];
  const mode = detectHostMode();

  checks.push({
    id: "ide_host",
    status: mode === "wsl-wrap" ? "warn" : "ok",
    message: `IDE host: ${hostModeLabel()}`,
    value: mode,
    fix:
      mode === "wsl-wrap"
        ? "Prefer Cursor/VS Code Remote-WSL attached to the Ubuntu distro (main supported path)."
        : "",
    code: mode === "wsl-wrap" ? "STALE_PATH" : undefined,
  });

  if (mode === "wsl-wrap") {
    const probe = probeWslWrap();
    checks.push({
      id: "wsl_wrap",
      status: probe.ok ? "ok" : "fail",
      message: probe.ok ? "wsl.exe wrap OK" : "wsl.exe wrap failed",
      value: probe.detail,
      fix: probe.ok
        ? ""
        : "Install WSL, set ws63.wslDistro, or switch to Remote-WSL.",
      code: probe.ok ? undefined : "UNKNOWN",
    });
  }

  const cfgKeys: Array<{ key: string; val: string }> = [
    { key: "sdkPath", val: s.sdkPath },
    { key: "backendPath", val: s.backendPath },
    { key: "winPython", val: s.winPython },
  ];
  for (const { key, val } of cfgKeys) {
    if (!val) {
      continue;
    }
    if (/\/home\/zyh110206\//.test(val) || /\\Users\\zyh110206\\/i.test(val)) {
      checks.push({
        id: `stale_${key}`,
        status: "fail",
        message: `Stale absolute ${key} from another machine`,
        value: val,
        fix: "Doctor → Clear stale paths, or empty the setting and reopen SDK workspace.",
        code: "STALE_PATH",
      });
    }
  }

  if (s.sdkPath && !fs.existsSync(path.join(s.sdkPath, "build.py"))) {
    checks.push({
      id: "sdk_exists",
      status: "fail",
      message: "sdkPath does not contain build.py on this machine",
      value: s.sdkPath,
      fix: hintForCode("SDK_INVALID"),
      code: "SDK_INVALID",
    });
  }

  return checks;
}

function recomputeSummary(report: DoctorReport): void {
  const fail = report.checks.filter((c) => c.status === "fail").length;
  const warn = report.checks.filter((c) => c.status === "warn").length;
  const ok = report.checks.filter((c) => c.status === "ok").length;
  report.summary = { ok, warn, fail };
  report.overall = fail ? "fail" : warn ? "warn" : "ok";
}

function localFallbackReport(reason: string): DoctorReport {
  const s = getSettings();
  const checks: DoctorCheck[] = [];

  const backendOk = fs.existsSync(cliPath(s));
  checks.push({
    id: "backend",
    status: backendOk ? "ok" : "fail",
    message: backendOk ? "Backend CLI found" : "Backend CLI missing",
    value: cliPath(s),
    code: backendOk ? undefined : "BACKEND_MISSING",
    fix: backendOk ? "" : hintForCode("BACKEND_MISSING"),
  });

  const sdkOk = !!(s.sdkPath && fs.existsSync(path.join(s.sdkPath, "build.py")));
  checks.push({
    id: "sdk",
    status: sdkOk ? "ok" : "fail",
    message: sdkOk ? "SDK OK" : "SDK missing/invalid",
    value: s.sdkPath,
    code: sdkOk ? undefined : "SDK_MISSING",
    fix: sdkOk ? "" : hintForCode("SDK_MISSING"),
  });

  checks.push({
    id: "doctor_cli",
    status: "fail",
    message: `Doctor CLI unavailable: ${reason.slice(0, 200)}`,
    code: "UNKNOWN",
    fix: "Ensure python3 can run bundled ws63_cli.py doctor",
  });

  const fail = checks.filter((c) => c.status === "fail").length;
  const warn = checks.filter((c) => c.status === "warn").length;
  const ok = checks.filter((c) => c.status === "ok").length;
  return {
    version: 1,
    overall: fail ? "fail" : warn ? "warn" : "ok",
    summary: { ok, warn, fail },
    checks,
  };
}

export interface PreflightResult {
  ok: boolean;
  code?: ErrorCode;
  message: string;
  fix?: string;
}

export async function preflightFlash(): Promise<PreflightResult> {
  const s = getSettings();
  if (!fs.existsSync(cliPath(s))) {
    return {
      ok: false,
      code: "BACKEND_MISSING",
      message: "Backend ws63_cli.py not found",
      fix: hintForCode("BACKEND_MISSING"),
    };
  }
  if (!s.sdkPath || !fs.existsSync(path.join(s.sdkPath, "build.py"))) {
    return {
      ok: false,
      code: "SDK_MISSING",
      message: "SDK path invalid",
      fix: hintForCode("SDK_MISSING"),
    };
  }
  const fw = firmwareAbs(s);
  if (!fs.existsSync(fw)) {
    return {
      ok: false,
      code: "FIRMWARE_MISSING",
      message: `Firmware not found: ${fw}`,
      fix: hintForCode("FIRMWARE_MISSING"),
    };
  }

  const report = await runDoctorReport();
  const flashTool = report.checks.find((c) => c.id === "ws63flash");
  if (flashTool?.status === "fail") {
    return {
      ok: false,
      code: "TOOL_MISSING",
      message: flashTool.message,
      fix: flashTool.fix || hintForCode("TOOL_MISSING"),
    };
  }
  const ports = report.checks.find((c) => c.id === "ports");
  if (ports?.status === "fail") {
    return {
      ok: false,
      code: (ports.code as ErrorCode) || "PORT_MISSING",
      message: ports.message,
      fix: ports.fix || hintForCode("PORT_MISSING"),
    };
  }
  const stale = report.checks.find((c) => c.code === "STALE_PATH" && c.status === "fail");
  if (stale) {
    return {
      ok: false,
      code: "STALE_PATH",
      message: stale.message,
      fix: stale.fix || hintForCode("STALE_PATH"),
    };
  }
  if (!s.port) {
    return {
      ok: false,
      code: "PORT_MISSING",
      message: "No serial port configured",
      fix: hintForCode("PORT_MISSING"),
    };
  }
  return { ok: true, message: "ok" };
}

export async function preflightSerial(): Promise<PreflightResult> {
  const s = getSettings();
  if (!fs.existsSync(cliPath(s))) {
    return {
      ok: false,
      code: "BACKEND_MISSING",
      message: "Backend ws63_cli.py not found",
      fix: hintForCode("BACKEND_MISSING"),
    };
  }
  if (!s.port) {
    return {
      ok: false,
      code: "PORT_MISSING",
      message: "No serial port configured",
      fix: hintForCode("PORT_MISSING"),
    };
  }
  const report = await runDoctorReport();
  const pyserial = report.checks.find((c) => c.id === "pyserial");
  if (pyserial?.status === "fail") {
    return {
      ok: false,
      code: "DEPS_MISSING",
      message: pyserial.message,
      fix: pyserial.fix || hintForCode("DEPS_MISSING"),
    };
  }
  const winPy = report.checks.find((c) => c.id === "win_python");
  if (winPy?.status === "fail" && /^COM/i.test(s.port)) {
    return {
      ok: false,
      code: "WIN_PYTHON_MISSING",
      message: winPy.message,
      fix: winPy.fix || hintForCode("WIN_PYTHON_MISSING"),
    };
  }
  return { ok: true, message: "ok" };
}

export function hasCriticalFailures(report: DoctorReport): boolean {
  return report.checks.some((c) => c.status === "fail");
}

export function reportToMarkdown(report: DoctorReport): string {
  const lines = [
    `# WS63 Doctor — ${report.overall.toUpperCase()}`,
    "",
    `ok=${report.summary.ok}  warn=${report.summary.warn}  fail=${report.summary.fail}`,
    "",
  ];
  for (const c of report.checks) {
    const icon = c.status === "ok" ? "✓" : c.status === "warn" ? "!" : "✗";
    lines.push(`## [${icon}] ${c.id} — ${c.status}`);
    lines.push(c.message);
    if (c.value) {
      lines.push(`value: ${c.value}`);
    }
    if (c.fix) {
      lines.push(`fix: ${c.fix}`);
    }
    if (c.code) {
      lines.push(`code: ${c.code}`);
    }
    lines.push("");
  }
  return lines.join("\n");
}
