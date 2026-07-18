import * as vscode from "vscode";

/** Colored codicons — charts.* theme colors render consistently in light/dark. */
export const IconColors = {
  blue: "charts.blue",
  green: "charts.green",
  orange: "charts.orange",
  yellow: "charts.yellow",
  red: "charts.red",
  purple: "charts.purple",
  teal: "terminal.ansiCyan",
  pink: "terminal.ansiMagenta",
} as const;

export function coloredIcon(
  id: string,
  color: string = IconColors.blue
): vscode.ThemeIcon {
  return new vscode.ThemeIcon(id, new vscode.ThemeColor(color));
}

export const SidebarIcons = {
  sectionDevice: coloredIcon("chip", IconColors.blue),
  sectionCommands: coloredIcon("run-all", IconColors.orange),
  sectionAdvanced: coloredIcon("extensions", IconColors.purple),
  target: coloredIcon("target", IconColors.blue),
  selectTarget: coloredIcon("target", IconColors.blue),
  port: coloredIcon("plug", IconColors.yellow),
  sdk: coloredIcon("folder-library", IconColors.teal),
  firmware: coloredIcon("package", IconColors.purple),
  sdkConfig: coloredIcon("settings-gear", IconColors.purple),
  buildInc: coloredIcon("tools", IconColors.green),
  buildClean: coloredIcon("refresh", IconColors.orange),
  cleanOutput: coloredIcon("clear-all", IconColors.red),
  flash: coloredIcon("zap", IconColors.yellow),
  flashMulti: coloredIcon("symbol-array", IconColors.yellow),
  monitor: coloredIcon("output", IconColors.green),
  monitorMulti: coloredIcon("multiple-windows", IconColors.green),
  debug: coloredIcon("debug-console", IconColors.teal),
  sendSerial: coloredIcon("arrow-right", IconColors.blue),
  pipeline: coloredIcon("flame", IconColors.orange),
  stop: coloredIcon("debug-stop", IconColors.red),
  quickConfig: coloredIcon("list-selection", IconColors.purple),
  newProject: coloredIcon("add", IconColors.green),
  menuconfig: coloredIcon("list-tree", IconColors.teal),
  settings: coloredIcon("gear", IconColors.pink),
  doctor: coloredIcon("heart", IconColors.red),
  setup: coloredIcon("rocket", IconColors.green),
} as const;

export const CommandIconMap: Record<string, vscode.ThemeIcon> = {
  "ws63.sdkConfig": SidebarIcons.sdkConfig,
  "ws63.buildIncremental": SidebarIcons.buildInc,
  "ws63.build": SidebarIcons.buildClean,
  "ws63.cleanOutput": SidebarIcons.cleanOutput,
  "ws63.flash": SidebarIcons.flash,
  "ws63.flashMulti": SidebarIcons.flashMulti,
  "ws63.monitor": SidebarIcons.monitor,
  "ws63.monitorMulti": SidebarIcons.monitorMulti,
  "ws63.debugConsole": SidebarIcons.debug,
  "ws63.sendSerial": SidebarIcons.sendSerial,
  "ws63.buildFlashMonitor": SidebarIcons.pipeline,
  "ws63.stop": SidebarIcons.stop,
  "ws63.quickConfig": SidebarIcons.quickConfig,
  "ws63.newProject": SidebarIcons.newProject,
  "ws63.menuconfig": SidebarIcons.menuconfig,
  "ws63.openSettings": SidebarIcons.settings,
  "ws63.selectPort": SidebarIcons.port,
  "ws63.selectTarget": SidebarIcons.selectTarget,
  "ws63.doctor": SidebarIcons.doctor,
  "ws63.setup": SidebarIcons.setup,
};
