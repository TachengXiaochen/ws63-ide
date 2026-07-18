import * as vscode from "vscode";
import { runBuild, runMenuconfig } from "./build";
import { runCleanOutput } from "./clean";
import { runDebugConsole } from "./debugConsole";
import { runFlash } from "./flash";
import { runFlashMulti } from "./flashMulti";
import { runMonitor, runMonitorMulti } from "./monitor";
import { runQuickConfig } from "./quickConfig";
import { runNewProject } from "./newProject";
import { runSendSerial } from "./sendSerial";
import { runSdkConfig } from "./sdkConfig";
import { runStop } from "./stop";
import { openSettings, selectTarget } from "./settings";
import { runDoctor, runSetupWizard } from "./doctor";
import { getSettings } from "../settings";
import { backendClient } from "../host/backendClient";

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
  const result = await backendClient.ports();
  const lines = result.stdout
    .split("\n")
    .map((l) => l.trim())
    .filter(Boolean)
    .filter((l) => !l.startsWith("No serial"));

  if (!lines.length) {
    vscode.window.showWarningMessage(
      "No serial ports found. On Ubuntu use a USB serial device (/dev/ttyUSB*). " +
        "COM* needs Win Python from WSL, or use Remote-WSL + /dev/ttyUSB*."
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
  runFlashMulti,
  runMonitor,
  runMonitorMulti,
  runSendSerial,
  runSdkConfig,
  runStop,
  runQuickConfig,
  runNewProject,
  openSettings,
  selectTarget,
  runDoctor,
  runSetupWizard,
};
