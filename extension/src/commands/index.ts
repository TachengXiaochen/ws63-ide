import * as vscode from "vscode";
import { runBuild, runMenuconfig } from "./build";
import { runCleanOutput } from "./clean";
import { runDebugConsole } from "./debugConsole";
import { runFlash } from "./flash";
import { runMonitor } from "./monitor";
import { runQuickConfig } from "./quickConfig";
import { runNewProject } from "./newProject";
import { runSendSerial } from "./sendSerial";
import { runSdkConfig } from "./sdkConfig";
import { runStop } from "./stop";
import { openSettings } from "./settings";
import { runDoctor, runSetupWizard } from "./doctor";
import { cliPath, getSettings } from "../settings";
import { runCaptured } from "../executor/shell";

export async function runBuildFlashMonitor(): Promise<void> {
  const buildCode = await runBuild(true);
  if (buildCode !== 0) {
    return;
  }
  const flashCode = await runFlash();
  if (flashCode !== 0) {
    return;
  }
  await runMonitor();
}

export async function selectPort(): Promise<void> {
  const s = getSettings();
  const result = await runCaptured(`python3 ${cliPath(s)} ports`);
  const lines = result.stdout
    .split("\n")
    .map((l) => l.trim())
    .filter(Boolean)
    .filter((l) => !l.startsWith("No serial"));

  if (!lines.length) {
    vscode.window.showWarningMessage(
      "No serial ports found. On Ubuntu use a USB serial device (/dev/ttyUSB*). " +
        "COM19 is Windows-only — set Win Python if you need Windows COM from WSL."
    );
    return;
  }

  const items = lines.map((line) => {
    const [device, backend, ...rest] = line.split("\t");
    return {
      label: device,
      description: backend || "",
      detail: rest.join(" "),
    };
  });

  const picked = await vscode.window.showQuickPick(items, {
    placeHolder: "Select serial port (Linux /dev/tty* or Windows COMx)",
    title: "WS63 Serial Port",
  });
  if (!picked) {
    return;
  }

  const cfg = vscode.workspace.getConfiguration("ws63");
  await cfg.update("port", picked.label, vscode.ConfigurationTarget.Workspace);
  vscode.window.showInformationMessage(`WS63 port set to ${picked.label}`);
}

export {
  runBuild,
  runMenuconfig,
  runCleanOutput,
  runDebugConsole,
  runFlash,
  runMonitor,
  runSendSerial,
  runSdkConfig,
  runStop,
  runQuickConfig,
  runNewProject,
  openSettings,
  runDoctor,
  runSetupWizard,
};
