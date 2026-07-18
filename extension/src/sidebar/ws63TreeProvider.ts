import * as vscode from "vscode";
import { firmwareAbs, getSettings } from "../settings";
import { CommandIconMap, SidebarIcons } from "./icons";

export class Ws63TreeProvider implements vscode.TreeDataProvider<Ws63TreeItem> {
  private _onDidChangeTreeData = new vscode.EventEmitter<Ws63TreeItem | undefined>();
  readonly onDidChangeTreeData = this._onDidChangeTreeData.event;

  refresh(): void {
    this._onDidChangeTreeData.fire(undefined);
  }

  getTreeItem(element: Ws63TreeItem): vscode.TreeItem {
    return element;
  }

  getChildren(element?: Ws63TreeItem): Ws63TreeItem[] {
    if (element) {
      return element.children ?? [];
    }
    const s = getSettings();
    return [
      section("Device", SidebarIcons.sectionDevice, [
        actionItem("Target", "ws63.selectTarget", SidebarIcons.target, s.target),
        actionItem("Port", "ws63.selectPort", SidebarIcons.port, s.port),
        infoItem("SDK", s.sdkPath, SidebarIcons.sdk),
        infoItem("Firmware", firmwareAbs(s), SidebarIcons.firmware),
      ]),
      section("Commands", SidebarIcons.sectionCommands, [
        actionItem("SDK Configuration Editor", "ws63.sdkConfig"),
        actionItem("Build (Incremental)", "ws63.buildIncremental"),
        actionItem("Build (Clean)", "ws63.build"),
        actionItem("Clean Output", "ws63.cleanOutput"),
        actionItem("Flash", "ws63.flash"),
        actionItem("Multi Flash", "ws63.flashMulti"),
        actionItem("Monitor", "ws63.monitor"),
        actionItem("Multi Monitor", "ws63.monitorMulti"),
        actionItem("Debug Console", "ws63.debugConsole"),
        actionItem("Send Serial Command", "ws63.sendSerial"),
        actionItem("Build + Flash + Monitor", "ws63.buildFlashMonitor"),
        actionItem("Stop", "ws63.stop"),
      ]),
      section("Advanced", SidebarIcons.sectionAdvanced, [
        actionItem("Doctor (Diagnose)", "ws63.doctor"),
        actionItem("Setup Wizard", "ws63.setup"),
        actionItem("Quick Config (SLE)", "ws63.quickConfig"),
        actionItem("New Application", "ws63.newProject"),
        actionItem("Menuconfig (Terminal)", "ws63.menuconfig"),
        actionItem("WS63 Settings", "ws63.openSettings"),
      ]),
    ];
  }
}

class Ws63TreeItem extends vscode.TreeItem {
  constructor(
    label: string | vscode.TreeItemLabel,
    collapsibleState: vscode.TreeItemCollapsibleState,
    public readonly children?: Ws63TreeItem[]
  ) {
    super(label, collapsibleState);
  }
}

function section(
  title: string,
  icon: vscode.ThemeIcon,
  children: Ws63TreeItem[]
): Ws63TreeItem {
  const item = new Ws63TreeItem(
    title.toUpperCase(),
    vscode.TreeItemCollapsibleState.Expanded,
    children
  );
  item.contextValue = "section";
  item.iconPath = icon;
  item.description = " ";
  item.tooltip = title;
  return item;
}

function infoItem(
  label: string,
  value: string,
  icon: vscode.ThemeIcon
): Ws63TreeItem {
  const item = new Ws63TreeItem(label, vscode.TreeItemCollapsibleState.None);
  item.description = truncate(value, 48);
  item.tooltip = value;
  item.contextValue = "info";
  item.iconPath = icon;
  return item;
}

function actionItem(
  label: string,
  command: string,
  iconOverride?: vscode.ThemeIcon,
  description?: string
): Ws63TreeItem {
  const item = new Ws63TreeItem(label, vscode.TreeItemCollapsibleState.None);
  item.command = { command, title: label };
  item.iconPath = iconOverride ?? CommandIconMap[command] ?? SidebarIcons.sdkConfig;
  if (description) {
    item.description = description;
  }
  item.contextValue = "action";
  return item;
}

function truncate(text: string, max: number): string {
  if (text.length <= max) {
    return text;
  }
  return text.slice(0, max - 1) + "…";
}
