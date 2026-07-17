import * as vscode from "vscode";
import { getSettings } from "./settings";
import { IconColors } from "./sidebar/icons";

let items: vscode.StatusBarItem[] = [];
let stopItem: vscode.StatusBarItem | undefined;

const SB = {
  brand: "$(circuit-board)",
  target: "$(target)",
  port: "$(plug)",
  buildInc: "$(tools)",
  build: "$(refresh)",
  flash: "$(zap)",
  monitor: "$(output)",
  debug: "$(debug-console)",
  sdkCfg: "$(settings-gear)",
  doctor: "$(heart)",
  stop: "$(debug-stop)",
} as const;

export function registerStatusBar(context: vscode.ExtensionContext): void {
  const s = getSettings();

  const brand = barItem(vscode.StatusBarAlignment.Left, 100, IconColors.blue);
  brand.text = `${SB.brand} WS63`;
  brand.tooltip = "WS63 IDE — open sidebar";
  brand.command = "ws63.refreshSidebar";
  brand.show();

  const target = barItem(vscode.StatusBarAlignment.Left, 99, IconColors.blue);
  target.text = `${SB.target} ${s.target}`;
  target.tooltip = "Build target";
  target.show();

  const port = barItem(vscode.StatusBarAlignment.Left, 98, IconColors.yellow);
  port.text = `${SB.port} ${s.port}`;
  port.tooltip = "Click to select COM port";
  port.command = "ws63.selectPort";
  port.show();

  stopItem = barItem(vscode.StatusBarAlignment.Right, 95, IconColors.red);
  stopItem.text = `${SB.stop} Stop`;
  stopItem.tooltip = "Stop running Build/Flash";
  stopItem.command = "ws63.stop";
  stopItem.show();

  const buildInc = btn(`${SB.buildInc} Build+`, "ws63.buildIncremental", 91, "Incremental build", IconColors.green);
  const build = btn(`${SB.build} Build`, "ws63.build", 90, "Clean build (-c)", IconColors.orange);
  const flash = btn(`${SB.flash} Flash`, "ws63.flash", 89, "Flash firmware", IconColors.yellow);
  const monitor = btn(`${SB.monitor} Monitor`, "ws63.monitor", 88, "Serial monitor", IconColors.green);
  const debug = btn(`${SB.debug} Debug`, "ws63.debugConsole", 87, "Serial console", IconColors.teal);
  const sdkCfg = btn(`${SB.sdkCfg} SDK Config`, "ws63.sdkConfig", 86, "Visual menuconfig", IconColors.purple);
  const doctor = btn(`${SB.doctor} Doctor`, "ws63.doctor", 85, "Environment diagnose", IconColors.red);

  items = [brand, target, port, stopItem, buildInc, build, flash, monitor, debug, sdkCfg, doctor];
  context.subscriptions.push(...items);

  vscode.workspace.onDidChangeConfiguration((e) => {
    if (e.affectsConfiguration("ws63")) {
      const ns = getSettings();
      target.text = `${SB.target} ${ns.target}`;
      port.text = `${SB.port} ${ns.port}`;
    }
  });
}

function barItem(
  alignment: vscode.StatusBarAlignment,
  priority: number,
  color: string
): vscode.StatusBarItem {
  const item = vscode.window.createStatusBarItem(alignment, priority);
  item.color = new vscode.ThemeColor(color);
  return item;
}

function btn(
  text: string,
  command: string,
  priority: number,
  tooltip: string,
  color: string
): vscode.StatusBarItem {
  const item = barItem(vscode.StatusBarAlignment.Right, priority, color);
  item.text = text;
  item.command = command;
  item.tooltip = tooltip;
  item.show();
  return item;
}
