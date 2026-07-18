/**
 * Recoverable Flash / Monitor / path failures — explain + one-click actions.
 */
import * as vscode from "vscode";
import { ErrorCode, hintForCode } from "./types";
import { clearStaleConfiguredPaths } from "../settings";

export interface RecoveryAction {
  id: string;
  label: string;
}

const ACTIONS: Partial<Record<ErrorCode, RecoveryAction[]>> = {
  PORT_BUSY: [
    { id: "stop", label: "Stop Monitor/Debug" },
    { id: "port", label: "Select Port" },
    { id: "retry", label: "Retry" },
    { id: "doctor", label: "Doctor" },
  ],
  PORT_MISSING: [
    { id: "port", label: "Select Port" },
    { id: "doctor", label: "Doctor" },
  ],
  PORT_NONE: [
    { id: "port", label: "Select Port" },
    { id: "doctor", label: "Doctor" },
  ],
  RESET_TIMEOUT: [
    { id: "retry", label: "Retry Flash" },
    { id: "doctor", label: "Doctor" },
  ],
  FIRMWARE_MISSING: [
    { id: "build", label: "Build" },
    { id: "settings", label: "Settings" },
  ],
  TOOL_MISSING: [
    { id: "doctor", label: "Doctor" },
    { id: "setup", label: "Setup" },
  ],
  DEPS_MISSING: [
    { id: "deps", label: "Install deps" },
    { id: "doctor", label: "Doctor" },
  ],
  WIN_PYTHON_MISSING: [
    { id: "settings", label: "Settings (Win Python)" },
    { id: "port", label: "Use /dev/ttyUSB*" },
    { id: "doctor", label: "Doctor" },
  ],
  STALE_PATH: [
    { id: "clearStale", label: "Clear stale paths" },
    { id: "setup", label: "Setup Wizard" },
    { id: "doctor", label: "Doctor" },
  ],
  SDK_MISSING: [
    { id: "setup", label: "Setup Wizard" },
    { id: "settings", label: "Settings" },
  ],
  SDK_INVALID: [
    { id: "clearStale", label: "Clear sdkPath" },
    { id: "setup", label: "Setup Wizard" },
  ],
  BACKEND_MISSING: [
    { id: "setup", label: "Setup" },
    { id: "doctor", label: "Doctor" },
  ],
  UNKNOWN: [
    { id: "doctor", label: "Doctor" },
    { id: "retry", label: "Retry" },
  ],
};

export async function offerRecovery(
  code: ErrorCode | string | undefined,
  title: string,
  detail?: string
): Promise<"retry" | undefined> {
  const err = (code as ErrorCode) || "UNKNOWN";
  const hint = hintForCode(err);
  const msg = detail ? `${title}\n${hint}\n${detail}` : `${title}\n${hint}`;
  const actions = ACTIONS[err] || ACTIONS.UNKNOWN!;
  const labels = actions.map((a) => a.label);

  const picked = await vscode.window.showErrorMessage(msg, { modal: false }, ...labels);
  if (!picked) {
    return undefined;
  }
  const action = actions.find((a) => a.label === picked);
  if (!action) {
    return undefined;
  }

  switch (action.id) {
    case "stop":
      await vscode.commands.executeCommand("ws63.stop");
      return "retry";
    case "port":
      await vscode.commands.executeCommand("ws63.selectPort");
      return undefined;
    case "retry":
      return "retry";
    case "doctor":
      await vscode.commands.executeCommand("ws63.doctor");
      return undefined;
    case "build":
      await vscode.commands.executeCommand("ws63.buildIncremental");
      return undefined;
    case "settings":
      await vscode.commands.executeCommand("ws63.openSettings");
      return undefined;
    case "setup":
      await vscode.commands.executeCommand("ws63.setup");
      return undefined;
    case "deps":
      await vscode.commands.executeCommand("ws63.doctor");
      return undefined;
    case "clearStale": {
      const n = await clearStaleConfiguredPaths();
      vscode.window.showInformationMessage(
        n ? `Cleared ${n} stale path setting(s). Re-run Setup.` : "No stale paths found."
      );
      return undefined;
    }
    default:
      return undefined;
  }
}
