/**
 * BackendClient — typed argv calls into ws63_cli.py / build.py / helpers.
 * Commands must not concatenate shell strings for execution.
 */
import { ChildProcess } from "child_process";
import {
  CapturedResult,
  SpawnSpec,
  assertLinuxPath,
  runArgv,
  spawnArgv,
  terminalCommandLine,
  backendEnv,
} from "./adapter";
import { cliPath, firmwareAbs, getSettings, projectCliPath, Ws63Settings } from "../settings";

export type { CapturedResult };

function s(): Ws63Settings {
  return getSettings();
}

function pythonCli(cliArgs: string[], cwd?: string): SpawnSpec {
  const settings = s();
  assertLinuxPath(settings.backendPath, "backendPath");
  assertLinuxPath(settings.sdkPath, "sdkPath");
  return {
    file: "python3",
    args: [cliPath(settings), ...cliArgs],
    cwd: cwd || settings.sdkPath || undefined,
    env: backendEnv(),
  };
}

export const backendClient = {
  env: backendEnv,

  run(spec: SpawnSpec): Promise<CapturedResult> {
    return runArgv(spec);
  },

  spawn(spec: SpawnSpec): ChildProcess {
    return spawnArgv(spec);
  },

  terminalLine(spec: SpawnSpec): string {
    return terminalCommandLine(spec);
  },

  /** python3 ws63_cli.py <args> */
  cli(args: string[], cwd?: string): Promise<CapturedResult> {
    return runArgv(pythonCli(args, cwd));
  },

  cliSpec(args: string[], cwd?: string): SpawnSpec {
    return pythonCli(args, cwd);
  },

  ports(): Promise<CapturedResult> {
    return this.cli(["ports"]);
  },

  doctor(extra: {
    sdk?: string;
    port?: string;
    firmwareRel?: string;
    target?: string;
    winPython?: string;
  } = {}): Promise<CapturedResult> {
    const settings = s();
    const args = ["doctor", "--format", "json"];
    const sdk = extra.sdk ?? settings.sdkPath;
    const port = extra.port ?? settings.port;
    const fw = extra.firmwareRel ?? settings.firmwareRel;
    const target = extra.target ?? settings.target;
    const win = extra.winPython ?? settings.winPython;
    if (sdk) {
      args.push("--sdk", sdk);
    }
    if (port) {
      args.push("-p", port);
    }
    if (fw) {
      args.push("--firmware-rel", fw);
    }
    if (target) {
      args.push("--target", target);
    }
    if (win) {
      args.push("--win-python", win);
    }
    return this.cli(args);
  },

  flash(opts: {
    port: string;
    firmware?: string;
    baud?: number;
    timeout?: number;
  }): SpawnSpec {
    const settings = s();
    const fw = opts.firmware || firmwareAbs(settings);
    assertLinuxPath(fw, "firmware");
    const args = [
      "flash",
      "-p",
      opts.port,
      "-f",
      fw,
      "-b",
      String(opts.baud ?? settings.flashBaud),
      "-t",
      String(opts.timeout ?? settings.flashTimeout),
    ];
    return pythonCli(args);
  },

  monitor(port: string, baud?: number): SpawnSpec {
    const settings = s();
    return pythonCli([
      "monitor",
      "--forever",
      "-p",
      port,
      "-b",
      String(baud ?? settings.monitorBaud),
    ]);
  },

  console(port: string, baud?: number): SpawnSpec {
    const settings = s();
    return pythonCli([
      "console",
      "-p",
      port,
      "-b",
      String(baud ?? settings.monitorBaud),
    ]);
  },

  write(port: string, text: string, baud?: number): Promise<CapturedResult> {
    const settings = s();
    return this.cli([
      "write",
      "-p",
      port,
      "-b",
      String(baud ?? settings.monitorBaud),
      text,
    ]);
  },

  exportMenus(): Promise<CapturedResult> {
    const settings = s();
    return this.cli([
      "export-menus",
      "--target",
      settings.target,
      "--chip",
      "ws63",
      "--core",
      "acore",
      "--sdk",
      settings.sdkPath,
    ]);
  },

  confserverArgs(): string[] {
    const settings = s();
    return [
      cliPath(settings),
      "confserver",
      "--target",
      settings.target,
      "--chip",
      "ws63",
      "--core",
      "acore",
      "--sdk",
      settings.sdkPath,
    ];
  },

  getconfig(keys: string[]): Promise<CapturedResult> {
    const settings = s();
    return this.cli([
      "getconfig",
      "--keys",
      keys.join(","),
      "--target",
      settings.target,
      "--chip",
      "ws63",
      "--core",
      "acore",
      "--sdk",
      settings.sdkPath,
    ]);
  },

  setconfig(assignments: string[], save: boolean): Promise<CapturedResult> {
    const settings = s();
    const args = [
      "setconfig",
      ...assignments,
      "--target",
      settings.target,
      "--chip",
      "ws63",
      "--core",
      "acore",
      "--sdk",
      settings.sdkPath,
    ];
    if (save) {
      args.push("--save");
    }
    return this.cli(args);
  },

  build(clean: boolean): SpawnSpec {
    const settings = s();
    assertLinuxPath(settings.sdkPath, "sdkPath");
    const args = clean
      ? ["-c", settings.target]
      : [settings.target];
    return {
      file: "./build.py",
      args,
      cwd: settings.sdkPath,
      env: backendEnv(),
    };
  },

  cleanOutput(): SpawnSpec {
    const settings = s();
    return {
      file: "rm",
      args: ["-rf", "output"],
      cwd: settings.sdkPath,
      env: backendEnv(),
    };
  },

  project(args: string[]): Promise<CapturedResult> {
    const settings = s();
    return runArgv({
      file: "python3",
      args: [projectCliPath(settings), ...args],
      cwd: settings.sdkPath || undefined,
      env: backendEnv(),
    });
  },

  pipInstallRequirements(): Promise<CapturedResult> {
    const settings = s();
    const req = `${settings.backendPath.replace(/\\/g, "/")}/requirements.txt`;
    return runArgv({
      file: "pip3",
      args: ["install", "-r", req],
      env: backendEnv(),
    });
  },

  detectWinPython(): Promise<CapturedResult> {
    const settings = s();
    return runArgv({
      file: "python3",
      args: [
        "-c",
        "from portio.win_python import detect_win_python; print(detect_win_python() or '')",
      ],
      env: {
        ...backendEnv(),
        PYTHONPATH: settings.backendPath,
      },
    });
  },
};
