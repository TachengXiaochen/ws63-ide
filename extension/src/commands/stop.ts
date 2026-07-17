import * as vscode from "vscode";
import { cancelActiveTask } from "../executor/stream";
import { logHint } from "../output/channel";

export async function runStop(): Promise<void> {
  if (cancelActiveTask()) {
    logHint("⏹ 任务已被用户停止");
    vscode.window.showInformationMessage("WS63: Build/Flash 已停止");
    return;
  }
  vscode.window.showInformationMessage("WS63: 当前没有正在运行的 Build/Flash 任务");
}
