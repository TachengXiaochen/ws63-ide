import * as fs from "fs";
import * as path from "path";
import { isRemoteShell, runCaptured } from "../executor/shell";
import { cliPath, firmwareAbs, getSettings } from "../settings";
import {
  DoctorCheck,
  DoctorReport,
  ErrorCode,
  hintForCode,
} from "./types";

function shellQuote(value: string): string {
  return `'${value.replace(/'/g, `'\\''`)}'`;
}

export async function runDoctorReport(): Promise<DoctorReport> {
  const s = getSettings();
  const args = [
    `python3 ${shellQuote(cliPath(s))} doctor`,
    `--format json`,
  ];
  if (s.sdkPath) {
    args.push(`--sdk ${shellQuote(s.sdkPath)}`);
  }
  if (s.port) {
    args.push(`-p ${shellQuote(s.port)}`);
  }
  if (s.firmwareRel) {
    args.push(`--firmware-rel ${shellQuote(s.firmwareRel)}`);
  }
  if (s.target) {
    args.push(`--target ${shellQuote(s.target)}`);
  }
  if (s.winPython) {
    args.push(`--win-python ${shellQuote(s.winPython)}`);
  }

  const result = await runCaptured(args.join(" "));
  const raw = (result.stdout || "").trim();
  try {
    const start = raw.indexOf("{");
    const end = raw.lastIndexOf("}");
    if (start >= 0 && end > start) {
      return JSON.parse(raw.slice(start, end + 1)) as DoctorReport;
    }
  } catch {
    /* fall through */
  }

  // Local fallback if CLI failed hard
  return localFallbackReport(result.stderr || result.stdout || "doctor CLI failed");
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

  const sdkOk = s.sdkPath && fs.existsSync(path.join(s.sdkPath, "build.py"));
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

/** Blocking checks before Flash. */
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
  return { ok: true, message: "Flash preflight OK" };
}

/** Blocking checks before Monitor / Debug Console. */
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

  const report = await runDoctorReport();
  const deps = report.checks.find((c) => c.id === "pyserial");
  if (deps?.status === "fail") {
    return {
      ok: false,
      code: "DEPS_MISSING",
      message: deps.message,
      fix: deps.fix || hintForCode("DEPS_MISSING"),
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
  if (ports?.status === "warn" && ports.code === "PORT_NONE") {
    return {
      ok: false,
      code: "PORT_NONE",
      message: ports.message,
      fix: ports.fix || hintForCode("PORT_NONE"),
    };
  }
  return { ok: true, message: "Serial preflight OK" };
}

export function reportToMarkdown(report: DoctorReport): string {
  const lines = [
    `# WS63 Doctor — ${report.overall.toUpperCase()}`,
    "",
    `ok=${report.summary.ok} warn=${report.summary.warn} fail=${report.summary.fail}`,
    `host_remote=${isRemoteShell()}`,
    `backend=${report.backend_root ?? ""}`,
    "",
  ];
  for (const c of report.checks) {
    const icon = c.status === "ok" ? "[OK]" : c.status === "warn" ? "[WARN]" : "[FAIL]";
    lines.push(`${icon} ${c.id}: ${c.message}`);
    if (c.value) {
      lines.push(`       value: ${c.value}`);
    }
    if (c.fix) {
      lines.push(`       fix: ${c.fix}`);
    }
  }
  lines.push("");
  return lines.join("\n");
}

export function hasCriticalFailures(report: DoctorReport): boolean {
  return report.checks.some(
    (c) =>
      c.status === "fail" &&
      ["backend", "sdk", "ws63flash", "pyserial"].includes(c.id)
  );
}
