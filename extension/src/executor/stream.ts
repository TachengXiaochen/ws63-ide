import { ChildProcess, spawn } from "child_process";
import * as vscode from "vscode";
import { getSettings } from "../settings";
import { isRemoteShell } from "./shell";

let activeProc: ChildProcess | null = null;

export async function setTaskRunning(running: boolean): Promise<void> {
  await vscode.commands.executeCommand("setContext", "ws63.taskRunning", running);
}

function spawnCommand(command: string, cwd?: string): ChildProcess {
  const env = { ...process.env, PYTHONUNBUFFERED: "1" };
  const opts = {
    cwd,
    env,
    detached: true,
    stdio: ["ignore", "pipe", "pipe"] as ["ignore", "pipe", "pipe"],
  };
  if (isRemoteShell()) {
    return spawn("bash", ["-lc", command], opts);
  }
  const settings = getSettings();
  return spawn("wsl", ["-d", settings.wslDistro, "bash", "-lc", command], opts);
}

function killTree(proc: ChildProcess): void {
  if (!proc.pid) {
    proc.kill("SIGKILL");
    return;
  }
  try {
    process.kill(-proc.pid, "SIGTERM");
  } catch {
    try {
      proc.kill("SIGTERM");
    } catch {
      /* already dead */
    }
  }
  setTimeout(() => {
    try {
      if (proc.pid) {
        process.kill(-proc.pid, "SIGKILL");
      }
    } catch {
      try {
        proc.kill("SIGKILL");
      } catch {
        /* already dead */
      }
    }
  }, 1500);
}

/** Kill the active build/flash process tree. Returns true if something was running. */
export function cancelActiveTask(): boolean {
  if (!activeProc) {
    return false;
  }
  const proc = activeProc;
  activeProc = null;
  killTree(proc);
  void setTaskRunning(false);
  return true;
}

export function isTaskRunning(): boolean {
  return activeProc !== null;
}

export interface StreamResult {
  code: number;
  stdout: string;
  stderr: string;
  cancelled: boolean;
}

export interface StreamOptions {
  cwd?: string;
  onLine?: (line: string, stream: "stdout" | "stderr") => void;
  token?: vscode.CancellationToken;
  /** When true, ignore progress-notification cancel (e.g. flash already succeeded). */
  ignoreCancel?: () => boolean;
}

function drainLines(
  buffer: { value: string },
  stream: "stdout" | "stderr",
  onLine: StreamOptions["onLine"],
  acc: string[]
): void {
  let idx = buffer.value.indexOf("\n");
  while (idx >= 0) {
    const line = buffer.value.slice(0, idx).replace(/\r$/, "");
    buffer.value = buffer.value.slice(idx + 1);
    acc.push(line);
    onLine?.(line, stream);
    idx = buffer.value.indexOf("\n");
  }
}

/** Run command with streaming output; supports cancellation via token or ws63.stop. */
export function runStreaming(command: string, options: StreamOptions = {}): Promise<StreamResult> {
  return new Promise((resolve) => {
    const stdoutAcc: string[] = [];
    const stderrAcc: string[] = [];
    const stdoutBuf = { value: "" };
    const stderrBuf = { value: "" };
    let cancelled = false;

    const finish = (code: number) => {
      activeProc = null;
      void setTaskRunning(false);
      resolve({
        code: cancelled ? 130 : code,
        stdout: stdoutAcc.join("\n"),
        stderr: stderrAcc.join("\n"),
        cancelled,
      });
    };

    const proc = spawnCommand(command, options.cwd);
    activeProc = proc;
    void setTaskRunning(true);

    const onCancel = () => {
      if (options.ignoreCancel?.()) {
        return;
      }
      if (cancelled) {
        return;
      }
      cancelled = true;
      killTree(proc);
    };

    options.token?.onCancellationRequested(onCancel);

    proc.stdout?.on("data", (chunk: Buffer) => {
      stdoutBuf.value += chunk.toString();
      drainLines(stdoutBuf, "stdout", options.onLine, stdoutAcc);
    });

    proc.stderr?.on("data", (chunk: Buffer) => {
      stderrBuf.value += chunk.toString();
      drainLines(stderrBuf, "stderr", options.onLine, stderrAcc);
    });

    proc.on("close", (code) => {
      if (stdoutBuf.value) {
        drainLines(stdoutBuf, "stdout", options.onLine, stdoutAcc);
      }
      if (stderrBuf.value) {
        drainLines(stderrBuf, "stderr", options.onLine, stderrAcc);
      }
      finish(code ?? 1);
    });

    proc.on("error", (err) => {
      stderrAcc.push(String(err));
      finish(1);
    });
  });
}
