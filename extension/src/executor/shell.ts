/**
 * Terminal helpers + thin compatibility wrappers.
 * Process execution lives in host/adapter + host/backendClient.
 */
import * as vscode from "vscode";
import {
  backendEnv,
  detectHostMode,
  isRemoteShell,
  shellQuote,
  terminalCommandLine,
  SpawnSpec,
} from "../host/adapter";
import { backendClient } from "../host/backendClient";

export { isRemoteShell, backendEnv, shellQuote, detectHostMode };

/** @deprecated use backendClient / runArgv — kept for gradual migration */
export async function runCaptured(
  command: string,
  cwd?: string
): Promise<{ stdout: string; stderr: string; code: number }> {
  return backendClient.run({
    file: "bash",
    args: ["-lc", command],
    cwd,
  });
}

export function createTerminal(name: string, opts?: vscode.TerminalOptions): vscode.Terminal {
  return vscode.window.createTerminal({
    name,
    env: backendEnv() as { [key: string]: string | null | undefined },
    ...opts,
  });
}

/** Send argv-based command into a terminal (quoted only here). */
export function sendSpecToTerminal(terminal: vscode.Terminal, spec: SpawnSpec): void {
  const s = vscode.workspace.getConfiguration("ws63");
  const winPython = (s.get<string>("winPython", "") || "").trim();
  if (winPython) {
    terminal.sendText(`export WS63_WIN_PYTHON=${shellQuote(winPython)}`, true);
  }
  terminal.sendText(terminalCommandLine(spec), true);
}

/** @deprecated prefer sendSpecToTerminal */
export function sendToTerminal(terminal: vscode.Terminal, command: string): void {
  sendSpecToTerminal(terminal, { file: "bash", args: ["-lc", command] });
}

export function monitorTerminalName(port: string): string {
  return `WS63 Monitor (${port})`;
}

export function getOrCreateMonitorTerminal(port?: string): vscode.Terminal {
  const name = port ? monitorTerminalName(port) : "WS63 Monitor";
  const existing = vscode.window.terminals.find((t) => t.name === name);
  if (existing) {
    return existing;
  }
  return createTerminal(name);
}

export function createMonitorTerminal(port: string): vscode.Terminal {
  const name = monitorTerminalName(port);
  const existing = vscode.window.terminals.find((t) => t.name === name);
  if (existing) {
    try {
      existing.sendText("\x03", false);
      existing.dispose();
    } catch {
      /* ignore */
    }
  }
  return createTerminal(name);
}

export function getOrCreateDebugTerminal(port?: string): vscode.Terminal {
  const name = port ? `WS63 Debug (${port})` : "WS63 Debug";
  const existing = vscode.window.terminals.find((t) => t.name === name);
  if (existing) {
    return existing;
  }
  return createTerminal(name);
}
