import * as vscode from "vscode";
import { cancelActiveTask } from "../executor/stream";
import { portLock } from "../diagnose/portLock";
import { logHint } from "../output/channel";

export async function runStop(): Promise<void> {
  const cancelledTask = cancelActiveTask();
  const monitors = await portLock.stopOwner("monitor");
  const debugs = await portLock.stopOwner("debug");

  if (cancelledTask || monitors || debugs) {
    const parts: string[] = [];
    if (cancelledTask) {
      parts.push("Build/Flash");
    }
    if (monitors) {
      parts.push(`${monitors} Monitor`);
    }
    if (debugs) {
      parts.push(`${debugs} Debug`);
    }
    logHint(`⏹ 已停止: ${parts.join(", ")}`);
    vscode.window.showInformationMessage(`WS63: 已停止 ${parts.join(" / ")}`);
    return;
  }
  vscode.window.showInformationMessage("WS63: 当前没有可停止的任务或串口会话");
}
