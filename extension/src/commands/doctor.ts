import * as vscode from "vscode";
import { clearStaleConfiguredPaths, getSettings } from "../settings";
import { backendClient } from "../host/backendClient";
import {
  hasCriticalFailures,
  reportToMarkdown,
  runDoctorReport,
} from "../diagnose/runner";
import { DoctorReport } from "../diagnose/types";

let channel: vscode.OutputChannel | undefined;

function getChannel(): vscode.OutputChannel {
  if (!channel) {
    channel = vscode.window.createOutputChannel("WS63 Doctor");
  }
  return channel;
}

export async function runDoctor(opts?: { silent?: boolean }): Promise<DoctorReport> {
  const ch = getChannel();
  if (!opts?.silent) {
    ch.clear();
    ch.appendLine("Running WS63 Doctor…");
    ch.show(true);
  }

  const report = await runDoctorReport();
  const md = reportToMarkdown(report);
  ch.appendLine(md);

  if (!opts?.silent) {
    await showDoctorActions(report, md);
  }
  return report;
}

async function showDoctorActions(report: DoctorReport, md: string): Promise<void> {
  const summary = `Doctor ${report.overall.toUpperCase()} — ok=${report.summary.ok} warn=${report.summary.warn} fail=${report.summary.fail}`;

  type Action = vscode.QuickPickItem & { id: string };
  const items: Action[] = [
    { id: "copy", label: "$(copy) Copy Report", description: "Clipboard" },
    { id: "clearStale", label: "$(trash) Clear stale paths", description: "换机必做" },
    { id: "settings", label: "$(gear) WS63 Settings", description: "Fix paths / port" },
    { id: "port", label: "$(plug) Select Port", description: "ws63.selectPort" },
    { id: "deps", label: "$(package) Install Python deps", description: "pip3 install -r requirements.txt" },
    { id: "setup", label: "$(rocket) Setup Wizard", description: "Guided fix" },
  ];
  if (report.overall !== "ok") {
    items.unshift({
      id: "noop",
      label: `$(warning) ${summary}`,
      description: "Review Output: WS63 Doctor",
    });
  } else {
    items.unshift({
      id: "noop",
      label: `$(check) ${summary}`,
      description: "Environment looks good",
    });
  }

  const picked = await vscode.window.showQuickPick(items, {
    title: "WS63 Doctor",
    placeHolder: "Choose an action",
  });
  if (!picked || picked.id === "noop") {
    return;
  }
  if (picked.id === "copy") {
    await vscode.env.clipboard.writeText(md);
    vscode.window.showInformationMessage("WS63 Doctor report copied");
    return;
  }
  if (picked.id === "clearStale") {
    const n = await clearStaleConfiguredPaths();
    vscode.window.showInformationMessage(
      n ? `Cleared ${n} stale path(s). Re-run Doctor.` : "No stale paths found."
    );
    if (n) {
      await runDoctor();
    }
    return;
  }
  if (picked.id === "settings") {
    await vscode.commands.executeCommand("ws63.openSettings");
    return;
  }
  if (picked.id === "port") {
    await vscode.commands.executeCommand("ws63.selectPort");
    return;
  }
  if (picked.id === "setup") {
    await vscode.commands.executeCommand("ws63.setup");
    return;
  }
  if (picked.id === "deps") {
    await installDeps();
  }
}

async function installDeps(): Promise<void> {
  const result = await backendClient.pipInstallRequirements();
  if (result.code === 0) {
    vscode.window.showInformationMessage("WS63: Python dependencies installed");
    await runDoctor();
  } else {
    vscode.window.showErrorMessage(
      `WS63: pip install failed — ${result.stderr || result.stdout || "unknown"}`
    );
  }
}

export async function maybeOfferSetup(
  context: vscode.ExtensionContext
): Promise<void> {
  const key = "ws63.setupCompleted";
  const done = context.globalState.get<boolean>(key, false);
  const report = await runDoctorReport();

  if (done && !hasCriticalFailures(report)) {
    return;
  }

  if (!hasCriticalFailures(report) && report.overall !== "fail") {
    if (!done) {
      await context.globalState.update(key, true);
    }
    return;
  }

  const choice = await vscode.window.showWarningMessage(
    "WS63 IDE: environment needs Setup (Doctor found problems).",
    "Run Setup",
    "Doctor",
    "Clear stale paths",
    "Later"
  );
  if (choice === "Run Setup") {
    await runSetupWizard(context);
  } else if (choice === "Doctor") {
    await runDoctor();
  } else if (choice === "Clear stale paths") {
    await clearStaleConfiguredPaths();
    await runDoctor();
  }
}

export async function runSetupWizard(
  context: vscode.ExtensionContext
): Promise<void> {
  const cleared = await clearStaleConfiguredPaths();
  if (cleared) {
    vscode.window.showInformationMessage(
      `Cleared ${cleared} stale path(s) before Setup.`
    );
  }

  let s = getSettings();
  const steps: string[] = [];

  if (!s.sdkPath) {
    const folder = await vscode.window.showOpenDialog({
      canSelectFiles: false,
      canSelectFolders: true,
      canSelectMany: false,
      openLabel: "Select SDK root (contains build.py)",
      title: "WS63 Setup — SDK Path",
    });
    if (folder?.[0]) {
      const cfg = vscode.workspace.getConfiguration("ws63");
      await cfg.update("sdkPath", folder[0].fsPath, vscode.ConfigurationTarget.Workspace);
      steps.push(`SDK → ${folder[0].fsPath}`);
    }
  } else {
    steps.push(`SDK → ${s.sdkPath}`);
  }

  const cfg = vscode.workspace.getConfiguration("ws63");
  const backendConfigured = (cfg.get<string>("backendPath", "") || "").trim();
  if (backendConfigured) {
    const keep = await vscode.window.showInformationMessage(
      "backendPath is set to a custom folder. Clear it to use the VSIX-bundled backend?",
      "Use bundled",
      "Keep custom"
    );
    if (keep === "Use bundled") {
      await cfg.update("backendPath", "", vscode.ConfigurationTarget.Workspace);
      await cfg.update("backendPath", "", vscode.ConfigurationTarget.Global);
      steps.push("backendPath → (bundled)");
    }
  }

  s = getSettings();
  const portChoice = await vscode.window.showInformationMessage(
    `Current COM port: ${s.port || "(empty)"}. Select a port now?`,
    "Select Port",
    "Keep"
  );
  if (portChoice === "Select Port") {
    await vscode.commands.executeCommand("ws63.selectPort");
    steps.push(`Port → ${getSettings().port}`);
  }

  const report = await runDoctor();
  if (!hasCriticalFailures(report)) {
    await context.globalState.update("ws63.setupCompleted", true);
    vscode.window.showInformationMessage(
      `WS63 Setup complete.${steps.length ? " " + steps.join("; ") : ""}`
    );
  } else {
    vscode.window.showWarningMessage(
      "WS63 Setup finished with failures — fix FAIL items in Doctor, then re-run Setup."
    );
  }
}
