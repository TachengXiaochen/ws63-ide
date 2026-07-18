/**
 * Streaming process runner — argv only via HostAdapter.
 */
import { ChildProcess } from "child_process";
import * as vscode from "vscode";
import { SpawnSpec, spawnArgv } from "../host/adapter";

const activeProcs = new Set<ChildProcess>();

export async function setTaskRunning(running: boolean): Promise<void> {
  await vscode.commands.executeCommand("setContext", "ws63.taskRunning", running);
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

export function cancelActiveTask(): boolean {
  if (!activeProcs.size) {
    return false;
  }
  for (const proc of [...activeProcs]) {
    killTree(proc);
  }
  activeProcs.clear();
  void setTaskRunning(false);
  return true;
}

export function isTaskRunning(): boolean {
  return activeProcs.size > 0;
}

export interface StreamResult {
  code: number;
  stdout: string;
  stderr: string;
  cancelled: boolean;
}

export interface StreamOptions {
  onLine?: (line: string, stream: "stdout" | "stderr") => void;
  token?: vscode.CancellationToken;
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

/** Preferred: spawn from argv spec (no shell string). */
export function runStreamingSpec(
  spec: SpawnSpec,
  options: StreamOptions = {}
): Promise<StreamResult> {
  return new Promise((resolve) => {
    const stdoutAcc: string[] = [];
    const stderrAcc: string[] = [];
    const stdoutBuf = { value: "" };
    const stderrBuf = { value: "" };
    let cancelled = false;
    let settled = false;

    const finish = (code: number) => {
      if (settled) {
        return;
      }
      settled = true;
      activeProcs.delete(proc);
      void setTaskRunning(activeProcs.size > 0);
      resolve({
        code: cancelled ? 130 : code,
        stdout: stdoutAcc.join("\n"),
        stderr: stderrAcc.join("\n"),
        cancelled,
      });
    };

    const proc = spawnArgv(spec);
    activeProcs.add(proc);
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

/**
 * @deprecated Prefer runStreamingSpec(SpawnSpec). Kept for transitional callers.
 */
export function runStreaming(
  command: string,
  options: StreamOptions & { cwd?: string } = {}
): Promise<StreamResult> {
  return runStreamingSpec(
    {
      file: "bash",
      args: ["-lc", command],
      cwd: options.cwd,
    },
    options
  );
}
