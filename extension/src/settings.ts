import * as fs from "fs";
import * as path from "path";
import * as vscode from "vscode";

export interface Ws63Settings {
  sdkPath: string;
  target: string;
  port: string;
  monitorBaud: number;
  flashBaud: number;
  flashTimeout: number;
  firmwareRel: string;
  backendPath: string;
  wslDistro: string;
  winPython: string;
}

let extensionRoot = "";

/** Call once from activate(). */
export function initSettings(context: vscode.ExtensionContext): void {
  extensionRoot = context.extensionPath;
}

export function getSettings(): Ws63Settings {
  const cfg = vscode.workspace.getConfiguration("ws63");
  return {
    sdkPath: resolveSdkPath(cfg),
    target: cfg.get<string>("target", "ws63-liteos-app"),
    port: cfg.get<string>("port", ""),
    monitorBaud: cfg.get<number>("monitorBaud", 115200),
    flashBaud: cfg.get<number>("flashBaud", 921600),
    flashTimeout: cfg.get<number>("flashTimeout", 120),
    firmwareRel: cfg.get<string>(
      "firmwareRel",
      "output/ws63/fwpkg/ws63-liteos-app/ws63-liteos-app_all.fwpkg"
    ),
    backendPath: resolveBackendPath(cfg),
    wslDistro: cfg.get<string>("wslDistro", "Ubuntu"),
    winPython: (cfg.get<string>("winPython", "") ?? "").trim(),
  };
}

export function firmwareAbs(settings: Ws63Settings): string {
  return path.posix.join(
    settings.sdkPath.replace(/\\/g, "/"),
    settings.firmwareRel.replace(/\\/g, "/")
  );
}

export function cliPath(settings: Ws63Settings): string {
  return path.join(settings.backendPath, "ws63_cli.py");
}

export function projectCliPath(settings: Ws63Settings): string {
  return path.join(settings.backendPath, "ws63_project.py");
}

function configuredOrEmpty(cfg: vscode.WorkspaceConfiguration, key: string): string {
  const raw = (cfg.get<string>(key, "") ?? "").trim();
  if (!raw) {
    return "";
  }
  // Ignore stale absolute defaults from older extension versions.
  if (looksLikeStaleDevPath(raw)) {
    return "";
  }
  return raw;
}

function looksLikeStaleDevPath(p: string): boolean {
  return /\/home\/zyh110206\//.test(p) || /\\Users\\zyh110206\\/i.test(p);
}

function pathExists(p: string): boolean {
  try {
    return fs.existsSync(p);
  } catch {
    return false;
  }
}

function hasBuildPy(dir: string): boolean {
  return pathExists(path.join(dir, "build.py"));
}

/** Find SDK root (directory containing build.py) from workspace folders. */
export function detectSdkPath(): string {
  const folders = vscode.workspace.workspaceFolders ?? [];
  for (const folder of folders) {
    let cur = folder.uri.fsPath;
    for (let i = 0; i < 6; i++) {
      if (hasBuildPy(cur)) {
        return cur;
      }
      const parent = path.dirname(cur);
      if (parent === cur) {
        break;
      }
      cur = parent;
    }
  }
  return "";
}

function resolveSdkPath(cfg: vscode.WorkspaceConfiguration): string {
  const configured = configuredOrEmpty(cfg, "sdkPath");
  if (configured && hasBuildPy(configured)) {
    return configured;
  }
  const detected = detectSdkPath();
  if (detected) {
    return detected;
  }
  // Last resort: return configured even if missing (so UI shows what user set).
  return configured;
}

function bundledBackendPath(): string {
  if (!extensionRoot) {
    return "";
  }
  return path.join(extensionRoot, "backend");
}

function siblingBackendPath(sdkPath: string): string {
  if (!sdkPath) {
    return "";
  }
  // <repo>/src → <repo>/tools/ws63-ide/backend
  // also try <sdk>/../tools/ws63-ide/backend
  const candidates = [
    path.join(sdkPath, "..", "tools", "ws63-ide", "backend"),
    path.join(sdkPath, "tools", "ws63-ide", "backend"),
  ];
  for (const c of candidates) {
    const resolved = path.resolve(c);
    if (pathExists(path.join(resolved, "ws63_cli.py"))) {
      return resolved;
    }
  }
  return "";
}

function resolveBackendPath(cfg: vscode.WorkspaceConfiguration): string {
  const configured = configuredOrEmpty(cfg, "backendPath");
  if (configured && pathExists(path.join(configured, "ws63_cli.py"))) {
    return configured;
  }

  const bundled = bundledBackendPath();
  if (bundled && pathExists(path.join(bundled, "ws63_cli.py"))) {
    return bundled;
  }

  const sdk = resolveSdkPath(cfg);
  const sibling = siblingBackendPath(sdk);
  if (sibling) {
    return sibling;
  }

  return bundled || configured;
}

/** Validate paths on activate; warn once if SDK/backend missing. */
export function validatePathsOnActivate(): void {
  const s = getSettings();
  const problems: string[] = [];

  if (!s.sdkPath || !hasBuildPy(s.sdkPath)) {
    problems.push(
      "SDK path not found (need folder with build.py). Open the SDK workspace or set ws63.sdkPath."
    );
  }
  if (!s.backendPath || !pathExists(path.join(s.backendPath, "ws63_cli.py"))) {
    problems.push(
      "Backend ws63_cli.py not found. Reinstall the extension (backend should be bundled)."
    );
  }

  if (problems.length) {
    void vscode.window
      .showWarningMessage(`WS63 IDE: ${problems.join(" ")}`, "Setup", "Doctor")
      .then((choice) => {
        if (choice === "Setup") {
          void vscode.commands.executeCommand("ws63.setup");
        } else if (choice === "Doctor") {
          void vscode.commands.executeCommand("ws63.doctor");
        }
      });
  }
}
