import * as vscode from "vscode";
import { OUTPUT_BUILD } from "../constants";
import { classifyBuildLine, classifyFlashLine, LogLevel } from "./logLine";
import { stripBackspaces } from "./sanitize";

let buildChannel: vscode.OutputChannel | undefined;

const TAG: Record<LogLevel, string> = {
  error: "✖ ERR",
  warn: "⚠ WRN",
  info: "● INF",
  debug: "  DBG",
};

export function getBuildOutput(): vscode.OutputChannel {
  if (!buildChannel) {
    buildChannel = vscode.window.createOutputChannel(OUTPUT_BUILD);
  }
  return buildChannel;
}

/** Plain-text tags — Cursor Output panel does not render ANSI reliably. */
function write(level: LogLevel, message: string): void {
  const clean = stripBackspaces(message);
  getBuildOutput().appendLine(`[${TAG[level]}] ${clean}`);
}

export function beginTask(title: string, command: string): void {
  const out = getBuildOutput();
  out.clear();
  out.show(true);
  write("info", `═══ ${title} ═══`);
  write("debug", `$ ${command}`);
  out.appendLine("");
}

export function logBuildLine(line: string, stream: "stdout" | "stderr"): void {
  write(classifyBuildLine(line, stream), line);
}

export function logFlashLine(line: string, stream: "stdout" | "stderr"): void {
  write(classifyFlashLine(line, stream), line);
}

export function logSuccess(message: string): void {
  getBuildOutput().appendLine(`[✔ OK] ${message}`);
}

export function logFailure(message: string): void {
  getBuildOutput().appendLine(`[✖ FAIL] ${message}`);
}

export function logCancelled(message: string): void {
  write("warn", `⏹ STOP — ${message}`);
}

export function logSection(title: string): void {
  write("warn", `── ${title} ──`);
}

export function logHint(message: string): void {
  write("warn", message);
}

export function logTailLine(line: string): void {
  const level = classifyBuildLine(line, "stdout");
  write(level === "info" ? "debug" : level, line);
}
