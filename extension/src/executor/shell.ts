import * as vscode from "vscode";
import { exec } from "child_process";
import { promisify } from "util";
import { getSettings } from "../settings";

const execAsync = promisify(exec);

/** True when extension runs inside Remote-WSL (or SSH), not Windows host. */
export function isRemoteShell(): boolean {
  return !!vscode.env.remoteName;
}

function shellQuote(value: string): string {
  return `'${value.replace(/'/g, `'\\''`)}'`;
}

export function backendEnv(): NodeJS.ProcessEnv {
  const s = getSettings();
  const env: NodeJS.ProcessEnv = {
    ...process.env,
    PYTHONUNBUFFERED: "1",
  };
  if (s.winPython) {
    env.WS63_WIN_PYTHON = s.winPython;
  }
  return env;
}

/** Wrap command for current environment (Remote-WSL vs Windows+WSL). */
export function wrapShell(command: string): string {
  const settings = getSettings();
  if (isRemoteShell()) {
    return command;
  }
  return `wsl -d ${settings.wslDistro} bash -lc ${shellQuote(command)}`;
}

export async function runCaptured(
  command: string,
  cwd?: string
): Promise<{ stdout: string; stderr: string; code: number }> {
  const full = wrapShell(command);
  try {
    const { stdout, stderr } = await execAsync(full, {
      cwd: isRemoteShell() ? cwd : undefined,
      maxBuffer: 10 * 1024 * 1024,
      env: backendEnv(),
    });
    return { stdout, stderr, code: 0 };
  } catch (err: unknown) {
    const e = err as { stdout?: string; stderr?: string; code?: number };
    return {
      stdout: e.stdout ?? "",
      stderr: e.stderr ?? "",
      code: typeof e.code === "number" ? e.code : 1,
    };
  }
}

export function createTerminal(name: string, opts?: vscode.TerminalOptions): vscode.Terminal {
  return vscode.window.createTerminal({
    name,
    env: backendEnv() as { [key: string]: string | null | undefined },
    ...opts,
  });
}

export function sendToTerminal(terminal: vscode.Terminal, command: string): void {
  const s = getSettings();
  // Ensure proxy path is visible even if terminal was created earlier.
  if (s.winPython) {
    terminal.sendText(`export WS63_WIN_PYTHON=${shellQuote(s.winPython)}`, true);
  }
  terminal.sendText(wrapShell(command), true);
}

export function getOrCreateMonitorTerminal(): vscode.Terminal {
  const existing = vscode.window.terminals.find((t) => t.name === "WS63 Monitor");
  if (existing) {
    return existing;
  }
  return createTerminal("WS63 Monitor");
}

export function getOrCreateDebugTerminal(): vscode.Terminal {
  const existing = vscode.window.terminals.find((t) => t.name === "WS63 Debug");
  if (existing) {
    return existing;
  }
  return createTerminal("WS63 Debug");
}
