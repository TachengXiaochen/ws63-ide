import * as fs from "fs";
import * as path from "path";
import * as vscode from "vscode";
import { detectSdkPath, getSettings } from "../settings";
import { runCaptured } from "../executor/shell";

type FieldKey =
  | "sdkPath"
  | "target"
  | "port"
  | "backendPath"
  | "firmwareRel"
  | "monitorBaud"
  | "flashBaud"
  | "flashTimeout"
  | "wslDistro"
  | "winPython";

interface SettingField {
  key: FieldKey;
  label: string;
  detail: string;
}

const WS63_FIELDS: SettingField[] = [
  {
    key: "sdkPath",
    label: "SDK Path",
    detail: "Folder with build.py — Browse / Auto-detect",
  },
  {
    key: "target",
    label: "Build Target",
    detail: "Pick from discovered targets",
  },
  {
    key: "port",
    label: "Serial Port",
    detail: "Auto-scan COM* / /dev/tty*",
  },
  {
    key: "backendPath",
    label: "Backend Path",
    detail: "ws63_cli.py folder — Browse / Bundled",
  },
  {
    key: "firmwareRel",
    label: "Firmware (relative)",
    detail: "Pick under SDK output/ or type relative path",
  },
  {
    key: "monitorBaud",
    label: "Monitor Baud",
    detail: "Common baud rates",
  },
  {
    key: "flashBaud",
    label: "Flash Baud",
    detail: "Common baud rates",
  },
  {
    key: "flashTimeout",
    label: "Flash Timeout (s)",
    detail: "0 = no limit",
  },
  {
    key: "winPython",
    label: "Win Python (COM proxy)",
    detail: "Windows python.exe for COM from WSL — Browse / Auto",
  },
  {
    key: "wslDistro",
    label: "WSL Distro",
    detail: "When Cursor runs on Windows host",
  },
];

const BAUD_OPTIONS = ["9600", "115200", "230400", "460800", "921600"];
const TIMEOUT_OPTIONS = ["0", "60", "120", "180", "300"];
const DEFAULT_TARGETS = ["ws63-liteos-app", "ws63-flashboot", "ws63-bootloader"];

/**
 * QuickPick settings with Browse / Auto-detect (no manual typing required).
 */
export async function openSettings(): Promise<void> {
  const cfg = vscode.workspace.getConfiguration("ws63");
  const resolved = getSettings();

  const current = (key: string): string => {
    const val = cfg.get<unknown>(key);
    return val === undefined || val === null ? "" : String(val);
  };

  const display = (f: SettingField): string => {
    const raw = current(f.key);
    if (f.key === "sdkPath") {
      return raw || `(auto) ${resolved.sdkPath || "not found"}`;
    }
    if (f.key === "backendPath") {
      return raw || `(bundled) ${resolved.backendPath || "not found"}`;
    }
    if (f.key === "winPython") {
      return raw || `(auto/env) ${resolved.winPython || "not set"}`;
    }
    if (f.key === "port") {
      return raw || resolved.port || "(not set — Select Port)";
    }
    if (f.key === "target") {
      return raw || resolved.target;
    }
    if (f.key === "monitorBaud") {
      return raw || String(resolved.monitorBaud);
    }
    if (f.key === "flashBaud") {
      return raw || String(resolved.flashBaud);
    }
    if (f.key === "flashTimeout") {
      return raw || String(resolved.flashTimeout);
    }
    if (f.key === "firmwareRel") {
      return raw || resolved.firmwareRel;
    }
    if (f.key === "wslDistro") {
      return raw || resolved.wslDistro;
    }
    return raw;
  };

  const items: vscode.QuickPickItem[] = WS63_FIELDS.map((f) => ({
    label: f.label,
    description: display(f),
    detail: f.detail,
  }));

  items.push({
    label: "$(heart) Run Doctor",
    description: "Validate environment",
  });

  const picked = await vscode.window.showQuickPick(items, {
    placeHolder: "WS63 Settings — pick a field (Browse / Auto, no typing needed)",
    title: "WS63 IDE Settings",
  });
  if (!picked) {
    return;
  }
  if (picked.label.includes("Run Doctor")) {
    await vscode.commands.executeCommand("ws63.doctor");
    return;
  }

  const field = WS63_FIELDS.find((f) => f.label === picked.label);
  if (!field) {
    return;
  }

  const value = await editField(field, current(field.key));
  if (value === undefined) {
    return;
  }
  await cfg.update(field.key, value, vscode.ConfigurationTarget.Workspace);
  vscode.window.showInformationMessage(`WS63: ${field.label} → ${value || "(empty/auto)"}`);
}

async function editField(
  field: SettingField,
  prev: string
): Promise<string | number | undefined> {
  switch (field.key) {
    case "sdkPath":
      return pickSdkPath(prev);
    case "backendPath":
      return pickBackendPath(prev);
    case "port":
      return pickPort();
    case "target":
      return pickTarget(prev);
    case "firmwareRel":
      return pickFirmwareRel(prev);
    case "monitorBaud":
    case "flashBaud":
      return pickNumberList(field.label, BAUD_OPTIONS, prev || "115200");
    case "flashTimeout":
      return pickNumberList(field.label, TIMEOUT_OPTIONS, prev || "120");
    case "winPython":
      return pickWinPython(prev);
    case "wslDistro":
      return pickWslDistro(prev);
    default:
      return undefined;
  }
}

async function pickSdkPath(prev: string): Promise<string | undefined> {
  const auto = detectSdkPath();
  const choice = await vscode.window.showQuickPick(
    [
      {
        label: "$(folder-opened) Browse folder…",
        description: "Open folder picker",
        id: "browse",
      },
      {
        label: "$(search) Auto-detect from workspace",
        description: auto || "no build.py found",
        id: "auto",
      },
      {
        label: "$(clear-all) Clear (use auto)",
        description: "Empty ws63.sdkPath",
        id: "clear",
      },
      ...(prev
        ? [{ label: "$(history) Keep current", description: prev, id: "keep" }]
        : []),
    ] as Array<vscode.QuickPickItem & { id: string }>,
    { title: "SDK Path", placeHolder: "Select how to set SDK root (contains build.py)" }
  );
  if (!choice) {
    return undefined;
  }
  if (choice.id === "keep") {
    return prev;
  }
  if (choice.id === "clear") {
    return "";
  }
  if (choice.id === "auto") {
    if (!auto) {
      vscode.window.showWarningMessage("No build.py found in workspace folders");
      return undefined;
    }
    return auto;
  }
  const uris = await vscode.window.showOpenDialog({
    canSelectFiles: false,
    canSelectFolders: true,
    canSelectMany: false,
    openLabel: "Select SDK root",
    title: "Select folder containing build.py",
    defaultUri: prev
      ? vscode.Uri.file(prev)
      : vscode.workspace.workspaceFolders?.[0]?.uri,
  });
  if (!uris?.[0]) {
    return undefined;
  }
  const selected = uris[0].fsPath;
  if (!fs.existsSync(path.join(selected, "build.py"))) {
    const ok = await vscode.window.showWarningMessage(
      "Selected folder has no build.py. Use anyway?",
      "Use",
      "Cancel"
    );
    if (ok !== "Use") {
      return undefined;
    }
  }
  return selected;
}

async function pickBackendPath(prev: string): Promise<string | undefined> {
  const s = getSettings();
  const choice = await vscode.window.showQuickPick(
    [
      {
        label: "$(extensions) Use bundled (recommended)",
        description: s.backendPath,
        id: "bundled",
      },
      {
        label: "$(folder-opened) Browse folder…",
        description: "Directory with ws63_cli.py",
        id: "browse",
      },
      {
        label: "$(clear-all) Clear (auto)",
        id: "clear",
      },
    ] as Array<vscode.QuickPickItem & { id: string }>,
    { title: "Backend Path" }
  );
  if (!choice) {
    return undefined;
  }
  if (choice.id === "clear" || choice.id === "bundled") {
    return "";
  }
  const uris = await vscode.window.showOpenDialog({
    canSelectFiles: false,
    canSelectFolders: true,
    canSelectMany: false,
    openLabel: "Select backend folder",
    defaultUri: prev ? vscode.Uri.file(prev) : undefined,
  });
  return uris?.[0]?.fsPath;
}

async function pickPort(): Promise<string | undefined> {
  await vscode.commands.executeCommand("ws63.selectPort");
  return getSettings().port;
}

async function pickTarget(prev: string): Promise<string | undefined> {
  const s = getSettings();
  const found = discoverTargets(s.sdkPath);
  const items: Array<vscode.QuickPickItem & { id: string }> = found.map((t) => ({
    label: t,
    description: t === prev ? "current" : "",
    id: t,
  }));
  items.push({
    label: "$(edit) Custom…",
    description: "Type a target name",
    id: "__custom__",
  });
  const picked = await vscode.window.showQuickPick(items, {
    title: "Build Target",
    placeHolder: "Select target",
  });
  if (!picked) {
    return undefined;
  }
  if (picked.id === "__custom__") {
    return vscode.window.showInputBox({
      title: "Custom target",
      value: prev || "ws63-liteos-app",
    });
  }
  return picked.id;
}

function discoverTargets(sdk: string): string[] {
  const set = new Set<string>(DEFAULT_TARGETS);
  if (!sdk) {
    return [...set];
  }
  const fwpkg = path.join(sdk, "output", "ws63", "fwpkg");
  try {
    if (fs.existsSync(fwpkg)) {
      for (const name of fs.readdirSync(fwpkg)) {
        const full = path.join(fwpkg, name);
        if (fs.statSync(full).isDirectory()) {
          set.add(name);
        }
      }
    }
  } catch {
    /* ignore */
  }
  return [...set].sort();
}

async function pickFirmwareRel(prev: string): Promise<string | undefined> {
  const s = getSettings();
  const candidates = discoverFirmwareRels(s.sdkPath, s.target);
  const items: Array<vscode.QuickPickItem & { id: string }> = candidates.map((rel) => ({
    label: path.basename(rel),
    description: rel,
    detail: fs.existsSync(path.join(s.sdkPath, rel)) ? "exists" : "missing (build first)",
    id: rel,
  }));
  items.push({
    label: "$(folder-opened) Browse file under SDK…",
    id: "__browse__",
  });
  items.push({
    label: "$(edit) Custom relative path…",
    id: "__custom__",
  });
  const picked = await vscode.window.showQuickPick(items, {
    title: "Firmware path (relative to SDK)",
  });
  if (!picked) {
    return undefined;
  }
  if (picked.id === "__custom__") {
    return vscode.window.showInputBox({
      title: "Firmware relative path",
      value: prev,
    });
  }
  if (picked.id === "__browse__") {
    if (!s.sdkPath) {
      vscode.window.showWarningMessage("Set SDK Path first");
      return undefined;
    }
    const uris = await vscode.window.showOpenDialog({
      canSelectFiles: true,
      canSelectFolders: false,
      canSelectMany: false,
      defaultUri: vscode.Uri.file(s.sdkPath),
      filters: { Firmware: ["fwpkg", "bin"], All: ["*"] },
    });
    if (!uris?.[0]) {
      return undefined;
    }
    const abs = uris[0].fsPath;
    const rel = path.relative(s.sdkPath, abs).replace(/\\/g, "/");
    if (rel.startsWith("..")) {
      vscode.window.showErrorMessage("File must be under SDK root");
      return undefined;
    }
    return rel;
  }
  return picked.id;
}

function discoverFirmwareRels(sdk: string, target: string): string[] {
  const rels = [
    `output/ws63/fwpkg/${target}/${target}_all.fwpkg`,
    `output/ws63/fwpkg/ws63-liteos-app/ws63-liteos-app_all.fwpkg`,
  ];
  if (!sdk) {
    return rels;
  }
  const root = path.join(sdk, "output", "ws63", "fwpkg");
  try {
    if (fs.existsSync(root)) {
      for (const dir of fs.readdirSync(root)) {
        const cand = path.join(root, dir, `${dir}_all.fwpkg`);
        if (fs.existsSync(cand)) {
          rels.push(path.relative(sdk, cand).replace(/\\/g, "/"));
        }
      }
    }
  } catch {
    /* ignore */
  }
  return [...new Set(rels)];
}

async function pickNumberList(
  title: string,
  options: string[],
  prev: string
): Promise<number | undefined> {
  const items = options.map((v) => ({
    label: v,
    description: v === prev ? "current" : "",
  }));
  items.push({ label: "$(edit) Custom…", description: "" });
  const picked = await vscode.window.showQuickPick(items, { title });
  if (!picked) {
    return undefined;
  }
  if (picked.label.includes("Custom")) {
    const raw = await vscode.window.showInputBox({
      title,
      value: prev,
      validateInput: (v) => (Number.isNaN(Number(v)) ? "Enter a number" : undefined),
    });
    if (raw === undefined) {
      return undefined;
    }
    return Number(raw);
  }
  return Number(picked.label);
}

async function pickWinPython(prev: string): Promise<string | undefined> {
  const detected = await detectWinPythonQuick();
  const choice = await vscode.window.showQuickPick(
    [
      {
        label: "$(search) Auto-detect under /mnt/c/…",
        description: detected || "not found",
        id: "auto",
      },
      {
        label: "$(file) Browse python.exe…",
        id: "browse",
      },
      {
        label: "$(clear-all) Clear",
        id: "clear",
      },
      ...(prev
        ? [{ label: "$(history) Keep current", description: prev, id: "keep" }]
        : []),
    ] as Array<vscode.QuickPickItem & { id: string }>,
    {
      title: "Windows Python (COM proxy from WSL)",
      placeHolder: "Required to open COM* when extension runs in WSL/Linux",
    }
  );
  if (!choice) {
    return undefined;
  }
  if (choice.id === "keep") {
    return prev;
  }
  if (choice.id === "clear") {
    return "";
  }
  if (choice.id === "auto") {
    if (!detected) {
      vscode.window.showWarningMessage(
        "Auto-detect failed. Install Python on Windows and Browse to python.exe."
      );
      return undefined;
    }
    return detected;
  }
  const uris = await vscode.window.showOpenDialog({
    canSelectFiles: true,
    canSelectFolders: false,
    canSelectMany: false,
    openLabel: "Select python.exe",
    filters: { Executable: ["exe"], All: ["*"] },
    defaultUri: vscode.Uri.file("/mnt/c/Users"),
  });
  return uris?.[0]?.fsPath;
}

async function detectWinPythonQuick(): Promise<string> {
  const s = getSettings();
  const result = await runCaptured(
    `python3 -c "import sys; sys.path.insert(0, '${s.backendPath.replace(/'/g, `'\\''`)}'); from portio.win_python import detect_win_python; print(detect_win_python() or '')"`
  );
  return (result.stdout || "").trim().split("\n").pop() || "";
}

async function pickWslDistro(prev: string): Promise<string | undefined> {
  const common = ["Ubuntu", "Ubuntu-22.04", "Ubuntu-24.04", "Debian"];
  const items = common.map((d) => ({
    label: d,
    description: d === prev ? "current" : "",
  }));
  items.push({ label: "$(edit) Custom…", description: "" });
  const picked = await vscode.window.showQuickPick(items, { title: "WSL Distro" });
  if (!picked) {
    return undefined;
  }
  if (picked.label.includes("Custom")) {
    return vscode.window.showInputBox({ title: "WSL Distro name", value: prev || "Ubuntu" });
  }
  return picked.label;
}
