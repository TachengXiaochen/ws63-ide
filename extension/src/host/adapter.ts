/**
 * HostAdapter — single place for Remote-WSL / WSL-wrap / Native process spawn.
 * Never build shell strings for execution; only quote at Terminal boundary.
 */
import { spawn, spawnSync, ChildProcess, execFile } from "child_process";
import { promisify } from "util";
import * as vscode from "vscode";
import { getSettings } from "../settings";

const execFileAsync = promisify(execFile);

export type HostMode = "remote" | "wsl-wrap" | "native";

export interface SpawnSpec {
  /** Executable (e.g. python3, ./build.py) — Linux path when mode is remote/wsl-wrap */
  file: string;
  args: string[];
  cwd?: string;
  env?: NodeJS.ProcessEnv;
}

export interface CapturedResult {
  stdout: string;
  stderr: string;
  code: number;
}

/** Quote one argv element for bash (Terminal only). */
export function shellQuote(value: string): string {
  if (value === "") {
    return "''";
  }
  if (/^[A-Za-z0-9_./:=@%+,^-]+$/.test(value)) {
    return value;
  }
  return `'${value.replace(/'/g, `'\\''`)}'`;
}

export function argvToShell(argv: string[]): string {
  return argv.map(shellQuote).join(" ");
}

export function detectHostMode(): HostMode {
  const remote = vscode.env.remoteName;
  if (remote === "wsl" || remote === "ssh-remote" || remote === "dev-container") {
    return "remote";
  }
  if (remote) {
    return "remote";
  }
  // Extension host on Windows → must wrap via wsl.exe
  if (process.platform === "win32") {
    return "wsl-wrap";
  }
  // Linux/macOS extension host without Remote (unusual for WS63)
  return "native";
}

export function isRemoteShell(): boolean {
  return detectHostMode() === "remote" || detectHostMode() === "native";
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

/**
 * Resolve (file, args, cwd) into an OS-level spawn without bash -c.
 * wsl-wrap: `wsl -d Distro -- file arg1 arg2 …`
 */
export function resolveSpawn(spec: SpawnSpec): { command: string; args: string[]; cwd?: string; env: NodeJS.ProcessEnv } {
  const mode = detectHostMode();
  const env = { ...backendEnv(), ...(spec.env || {}) };
  const cwd = spec.cwd;

  if (mode === "wsl-wrap") {
    const s = getSettings();
    // `wsl -d X -- cmd args` avoids bash -lc string injection / space bugs
    return {
      command: "wsl.exe",
      args: ["-d", s.wslDistro, "--", spec.file, ...spec.args],
      cwd: undefined, // cwd is a Windows path; let WSL use Linux cwd via absolute file paths
      env,
    };
  }

  return {
    command: spec.file,
    args: spec.args,
    cwd,
    env,
  };
}

export function spawnArgv(spec: SpawnSpec): ChildProcess {
  const r = resolveSpawn(spec);
  return spawn(r.command, r.args, {
    cwd: r.cwd,
    env: r.env,
    detached: true,
    stdio: ["ignore", "pipe", "pipe"],
    windowsHide: true,
  });
}

export async function runArgv(spec: SpawnSpec): Promise<CapturedResult> {
  const r = resolveSpawn(spec);
  try {
    const { stdout, stderr } = await execFileAsync(r.command, r.args, {
      cwd: r.cwd,
      env: r.env,
      maxBuffer: 10 * 1024 * 1024,
      windowsHide: true,
      encoding: "utf8",
    });
    return { stdout: String(stdout), stderr: String(stderr), code: 0 };
  } catch (err: unknown) {
    const e = err as {
      stdout?: string;
      stderr?: string;
      code?: number | string;
      status?: number;
    };
    const code =
      typeof e.code === "number"
        ? e.code
        : typeof e.status === "number"
          ? e.status
          : 1;
    return {
      stdout: e.stdout ?? "",
      stderr: e.stderr ?? "",
      code,
    };
  }
}

/** Build a bash line for VS Code Terminal (user-visible). Prefer Remote-WSL terminal. */
export function terminalCommandLine(spec: SpawnSpec): string {
  const mode = detectHostMode();
  const inner = argvToShell([spec.file, ...spec.args]);
  const withCd = spec.cwd ? `cd ${shellQuote(spec.cwd)} && ${inner}` : inner;
  if (mode === "wsl-wrap") {
    const s = getSettings();
    // Still need one shell line for Integrated Terminal on Windows host
    return `wsl.exe -d ${shellQuote(s.wslDistro)} -- bash -lc ${shellQuote(withCd)}`;
  }
  return withCd;
}

export function assertLinuxPath(p: string, label: string): void {
  if (!p) {
    return;
  }
  if (detectHostMode() === "wsl-wrap" && /^[A-Za-z]:[\\/]/.test(p)) {
    throw new Error(
      `${label} looks like a Windows path (${p}). ` +
        `Open the SDK via Remote-WSL so paths are /home/... — pure Windows host is not supported for build.`
    );
  }
}

export function hostModeLabel(): string {
  const m = detectHostMode();
  switch (m) {
    case "remote":
      return `Remote (${vscode.env.remoteName || "remote"})`;
    case "wsl-wrap":
      return "Windows host → WSL wrap (prefer Remote-WSL)";
    case "native":
      return "Native Linux";
    default:
      return m;
  }
}

/** Quick sync probe that wsl.exe exists when needed. */
export function probeWslWrap(): { ok: boolean; detail: string } {
  if (detectHostMode() !== "wsl-wrap") {
    return { ok: true, detail: "n/a" };
  }
  const s = getSettings();
  const r = spawnSync("wsl.exe", ["-d", s.wslDistro, "--", "echo", "ok"], {
    encoding: "utf8",
    windowsHide: true,
    timeout: 8000,
  });
  if (r.status === 0 && (r.stdout || "").includes("ok")) {
    return { ok: true, detail: `wsl -d ${s.wslDistro}` };
  }
  return {
    ok: false,
    detail: (r.stderr || r.stdout || `exit ${r.status}`).slice(0, 200),
  };
}
