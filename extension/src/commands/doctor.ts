import * as vscode from "vscode";
import { getSettings } from "../settings";
import { runCaptured } from "../executor/shell";
import {
  hasCriticalFailures,
  reportToMarkdown,
  runDoctorReport,
} from "../diagnose/runner";
import { DoctorReport } from "../diagnose/types";

function doctorChannel(): vscode.OutputChannel {
  return vscode.window.createOutputChannel("WS63 Doctor");
}

let channel: vscode.OutputChannel | undefined;

function getChannel(): vscode.OutputChannel {
  if (!channel) {
    channel = doctorChannel();
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
    { id: "settings", label: "$(gear) WS63 Settings", description: "Fix paths / port" },
    { id: "port", label: "$(plug) Select Port", description: "ws63.selectPort" },
    { id: "deps", label: "$(package) Install Python deps", description: "pip3 install -r requirements.txt" },
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
  if (picked.id === "settings") {
    await vscode.commands.executeCommand("ws63.openSettings");
    return;
  }
  if (picked.id === "port") {
    await vscode.commands.executeCommand("ws63.selectPort");
    return;
  }
  if (picked.id === "deps") {
    await installDeps();
  }
}

async function installDeps(): Promise<void> {
  const s = getSettings();
  const req = `${s.backendPath}/requirements.txt`.replace(/\\/g, "/");
  const cmd = `pip3 install -r '${req.replace(/'/g, `'\\''`)}'`;
  const result = await runCaptured(cmd);
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
    "Later"
  );
  if (choice === "Run Setup") {
    await runSetupWizard(context);
  } else if (choice === "Doctor") {
    await runDoctor();
  }
}

export async function runSetupWizard(
  context: vscode.ExtensionContext
): Promise<void> {
  const s = getSettings();
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

  const portChoice = await vscode.window.showInformationMessage(
    `Current COM port: ${getSettings().port}. Select a port now?`,
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
