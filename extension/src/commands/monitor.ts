import * as vscode from "vscode";
import { cliPath, getSettings } from "../settings";
import {
  getOrCreateMonitorTerminal,
  sendToTerminal,
} from "../executor/shell";
import { portLock } from "../diagnose/portLock";
import { preflightSerial } from "../diagnose/runner";
import { hintForCode } from "../diagnose/types";

export async function runMonitor(): Promise<void> {
  const pre = await preflightSerial();
  if (!pre.ok) {
    vscode.window.showErrorMessage(
      `WS63 Monitor blocked: ${pre.message}. ${pre.fix || hintForCode(pre.code)}`
    );
    return;
  }

  const s = getSettings();
  const ok = await portLock.acquire("monitor", s.port);
  if (!ok) {
    return;
  }

  const cmd = `python3 '${cliPath(s).replace(/'/g, `'\\''`)}' monitor --forever -p ${s.port} -b ${s.monitorBaud}`;
  const terminal = getOrCreateMonitorTerminal();
  portLock.bindTerminal("monitor", terminal);
  terminal.show(true);
  sendToTerminal(terminal, cmd);
  vscode.window.showInformationMessage(
    `WS63 Monitor on ${s.port}. Close SSCOM/BurnTool if the port stays busy.`
  );
}
