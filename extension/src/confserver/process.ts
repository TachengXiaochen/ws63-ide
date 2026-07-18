import { spawn, ChildProcessWithoutNullStreams } from "child_process";
import { getSettings } from "../settings";
import { resolveSpawn } from "../host/adapter";
import { backendClient } from "../host/backendClient";

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
  private restarting = false;

  get currentState(): ConfserverState | undefined {
    return this.state;
  }

  get alive(): boolean {
    return !!this.proc && !this.proc.killed && this.proc.exitCode === null;
  }

  async start(): Promise<ConfserverState> {
    if (this.state && this.alive) {
      return this.state;
    }
    return this.spawnFresh();
  }

  async restart(): Promise<ConfserverState> {
    this.disposeProcessOnly();
    this.state = undefined;
    this.buffer = "";
    return this.spawnFresh();
  }

  private async spawnFresh(): Promise<ConfserverState> {
    const s = getSettings();
    const resolved = resolveSpawn({
      file: "python3",
      args: backendClient.confserverArgs(),
      cwd: s.sdkPath,
    });

    this.proc = spawn(resolved.command, resolved.args, {
      cwd: resolved.cwd,
      env: resolved.env,
      stdio: ["pipe", "pipe", "pipe"],
      windowsHide: true,
    }) as ChildProcessWithoutNullStreams;

    this.proc.stdout.setEncoding("utf8");
    this.proc.stdout.on("data", (chunk: string) => this.onStdout(chunk));
    this.proc.on("exit", () => {
      this.rejectQueue(new Error("confserver exited"));
      this.proc = undefined;
    });

    const failed = new Promise<never>((_, reject) => {
      this.proc?.on("error", reject);
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
    try {
      return await this.requestOnce(req);
    } catch (e) {
      if (this.restarting) {
        throw e;
      }
      this.restarting = true;
      try {
        await this.restart();
        return await this.requestOnce(req);
      } finally {
        this.restarting = false;
      }
    }
  }

  private async requestOnce(req: Record<string, unknown>): Promise<ConfserverState> {
    if (!this.alive || !this.proc?.stdin.writable) {
      throw new Error("confserver not running");
    }
    const line = JSON.stringify({ version: 3, ...req });
    const resp = await new Promise<ConfserverState>((resolve, reject) => {
      this.queue.push({ resolve, reject });
      try {
        this.proc!.stdin.write(line + "\n");
      } catch (err) {
        this.queue.pop();
        reject(err instanceof Error ? err : new Error(String(err)));
      }
    });
    this.mergeState(resp);
    return resp;
  }

  dispose(): void {
    this.disposeProcessOnly();
    this.rejectQueue(new Error("confserver stopped"));
    this.state = undefined;
    this.initialResolve = undefined;
  }

  private disposeProcessOnly(): void {
    if (this.proc) {
      try {
        this.proc.stdin.end();
      } catch {
        /* ignore */
      }
      try {
        this.proc.kill();
      } catch {
        /* ignore */
      }
      this.proc = undefined;
    }
  }

  private rejectQueue(err: Error): void {
    this.queue.forEach((q) => q.reject(err));
    this.queue = [];
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
