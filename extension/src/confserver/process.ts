import { spawn, ChildProcessWithoutNullStreams } from "child_process";
import { cliPath, getSettings } from "../settings";
import { isRemoteShell } from "../executor/shell";

export interface ConfserverState {
  version: number;
  values: Record<string, boolean | number | string>;
  visible: Record<string, boolean>;
  ranges?: Record<string, [number, number]>;
  defaults?: Record<string, boolean>;
  warnings?: Record<string, string>;
  error?: string[];
  save?: { success: boolean; config_path?: string };
}

export class ConfserverProcess {
  private proc?: ChildProcessWithoutNullStreams;
  private buffer = "";
  private queue: Array<{
    resolve: (s: ConfserverState) => void;
    reject: (e: Error) => void;
  }> = [];
  private state?: ConfserverState;
  private initialResolve?: (s: ConfserverState) => void;

  get currentState(): ConfserverState | undefined {
    return this.state;
  }

  async start(): Promise<ConfserverState> {
    if (this.state && this.proc) {
      return this.state;
    }

    const s = getSettings();
    const args = [
      cliPath(s),
      "confserver",
      "--target",
      s.target,
      "--chip",
      "ws63",
      "--core",
      "acore",
      "--sdk",
      s.sdkPath,
    ];

    this.proc = isRemoteShell()
      ? spawn("python3", args, {
          cwd: s.sdkPath,
          env: { ...process.env, PYTHONUNBUFFERED: "1" },
        })
      : spawn("wsl", ["-d", s.wslDistro, "python3", ...args], {
          env: { ...process.env, PYTHONUNBUFFERED: "1" },
        });

    this.proc.stdout.setEncoding("utf8");
    this.proc.stdout.on("data", (chunk: string) => this.onStdout(chunk));

    const failed = new Promise<never>((_, reject) => {
      this.proc?.on("error", reject);
      this.proc?.on("exit", (code) => {
        if (code !== 0 && code !== null && this.initialResolve) {
          reject(new Error(`confserver exited (${code})`));
        }
      });
    });

    const initial = await Promise.race([
      new Promise<ConfserverState>((resolve) => {
        this.initialResolve = resolve;
      }),
      failed,
    ]);
    this.mergeState(initial);
    return initial;
  }

  async request(req: Record<string, unknown>): Promise<ConfserverState> {
    if (!this.proc?.stdin.writable) {
      throw new Error("confserver not running");
    }
    const line = JSON.stringify({ version: 3, ...req });
    const resp = await new Promise<ConfserverState>((resolve, reject) => {
      this.queue.push({ resolve, reject });
      this.proc!.stdin.write(line + "\n");
    });
    this.mergeState(resp);
    return resp;
  }

  dispose(): void {
    if (this.proc) {
      this.proc.stdin.end();
      this.proc.kill();
      this.proc = undefined;
    }
    this.queue.forEach((q) => q.reject(new Error("confserver stopped")));
    this.queue = [];
    this.state = undefined;
    this.initialResolve = undefined;
  }

  private onStdout(chunk: string): void {
    this.buffer += chunk;
    let idx: number;
    while ((idx = this.buffer.indexOf("\n")) >= 0) {
      const line = this.buffer.slice(0, idx).trim();
      this.buffer = this.buffer.slice(idx + 1);
      if (!line.startsWith("{")) {
        continue;
      }
      try {
        const parsed = JSON.parse(line) as ConfserverState;
        if (this.initialResolve) {
          this.initialResolve(parsed);
          this.initialResolve = undefined;
          return;
        }
        const pending = this.queue.shift();
        if (pending) {
          pending.resolve(parsed);
        }
      } catch {
        // skip malformed
      }
    }
  }

  private mergeState(delta: ConfserverState): void {
    if (!this.state) {
      this.state = {
        version: delta.version,
        values: { ...(delta.values || {}) },
        visible: { ...(delta.visible || {}) },
        ranges: { ...(delta.ranges || {}) },
        defaults: { ...(delta.defaults || {}) },
        warnings: { ...(delta.warnings || {}) },
      };
      return;
    }
    if (delta.values) {
      Object.assign(this.state.values, delta.values);
    }
    if (delta.visible) {
      Object.assign(this.state.visible, delta.visible);
    }
    if (delta.ranges) {
      this.state.ranges = this.state.ranges || {};
      Object.assign(this.state.ranges, delta.ranges);
    }
    if (delta.defaults) {
      this.state.defaults = this.state.defaults || {};
      Object.assign(this.state.defaults, delta.defaults);
    }
    if (delta.error?.length) {
      this.state.error = delta.error;
    }
    if (delta.save) {
      this.state.save = delta.save;
    }
  }
}

let shared: ConfserverProcess | undefined;

export function getConfserver(): ConfserverProcess {
  if (!shared) {
    shared = new ConfserverProcess();
  }
  return shared;
}

export function disposeConfserver(): void {
  shared?.dispose();
  shared = undefined;
}
