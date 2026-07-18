import * as vscode from "vscode";
import {
  openSettings,
  runBuild,
  runBuildFlashMonitor,
  runCleanOutput,
  runDebugConsole,
  runDoctor,
  runFlash,
  runFlashMulti,
  runMenuconfig,
  runMonitor,
  runMonitorMulti,
  runQuickConfig,
  runNewProject,
  runSendSerial,
  runSdkConfig,
  runSetupWizard,
  runStop,
  selectPort,
  selectTarget,
} from "./commands";
import { registerStatusBar } from "./statusBar";
import { Ws63TreeProvider } from "./sidebar/ws63TreeProvider";
import { ProgressPanel } from "./ui/progressPanel";
import { initSettings, migratePathsOnActivate, validatePathsOnActivate } from "./settings";
import { portLock } from "./diagnose/portLock";
import { maybeOfferSetup } from "./commands/doctor";
import { registerBuildDiagnostics } from "./output/diagnostics";

export function activate(context: vscode.ExtensionContext): void {
  initSettings(context);
  portLock.init(context);
  ProgressPanel.init(context);
  registerBuildDiagnostics(context);
  void migratePathsOnActivate().then(() => validatePathsOnActivate());
  const tree = new Ws63TreeProvider();
  context.subscriptions.push(
    vscode.window.registerTreeDataProvider("ws63Explorer", tree),
    vscode.commands.registerCommand("ws63.build", () => runBuild(true)),
    vscode.commands.registerCommand("ws63.buildIncremental", () => runBuild(false)),
    vscode.commands.registerCommand("ws63.cleanOutput", () => runCleanOutput()),
    vscode.commands.registerCommand("ws63.flash", () => runFlash()),
    vscode.commands.registerCommand("ws63.flashMulti", () => runFlashMulti()),
    vscode.commands.registerCommand("ws63.monitor", () => runMonitor()),
    vscode.commands.registerCommand("ws63.monitorMulti", () => runMonitorMulti()),
    vscode.commands.registerCommand("ws63.debugConsole", () => runDebugConsole()),
    vscode.commands.registerCommand("ws63.sendSerial", () => runSendSerial()),
    vscode.commands.registerCommand("ws63.menuconfig", () => runMenuconfig()),
    vscode.commands.registerCommand("ws63.buildFlashMonitor", () => runBuildFlashMonitor()),
    vscode.commands.registerCommand("ws63.selectPort", () => selectPort()),
    vscode.commands.registerCommand("ws63.selectTarget", () => selectTarget()),
    vscode.commands.registerCommand("ws63.openSettings", () => openSettings()),
    vscode.commands.registerCommand("ws63.quickConfig", () => runQuickConfig()),
    vscode.commands.registerCommand("ws63.sdkConfig", () => runSdkConfig()),
    vscode.commands.registerCommand("ws63.newProject", () => runNewProject()),
    vscode.commands.registerCommand("ws63.stop", () => runStop()),
    vscode.commands.registerCommand("ws63.doctor", () => runDoctor()),
    vscode.commands.registerCommand("ws63.setup", () => runSetupWizard(context)),
    vscode.commands.registerCommand("ws63.refreshSidebar", () => tree.refresh())
  );

  registerStatusBar(context);
  void vscode.commands.executeCommand("setContext", "ws63.taskRunning", false);
  void maybeOfferSetup(context);
}

export function deactivate(): void {}
