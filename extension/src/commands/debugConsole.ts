import * as vscode from "vscode";
import { cliPath, getSettings } from "../settings";
import {
  getOrCreateDebugTerminal,
  sendToTerminal,
} from "../executor/shell";
import { portLock } from "../diagnose/portLock";
import { preflightSerial } from "../diagnose/runner";
import { hintForCode } from "../diagnose/types";

export async function runDebugConsole(): Promise<void> {
  const pre = await preflightSerial();
  if (!pre.ok) {
    vscode.window.showErrorMessage(
      `WS63 Debug Console blocked: ${pre.message}. ${pre.fix || hintForCode(pre.code)}`
    );
    return;
  }

  const s = getSettings();
  const ok = await portLock.acquire("debug", s.port);
  if (!ok) {
    return;
  }

  const cmd = `python3 '${cliPath(s).replace(/'/g, `'\\''`)}' console -p ${s.port} -b ${s.monitorBaud}`;
  const terminal = getOrCreateDebugTerminal();
  portLock.bindTerminal("debug", terminal);
  terminal.show(true);
  sendToTerminal(terminal, cmd);
  vscode.window.showInformationMessage(
    `WS63 Debug Console on ${s.port}. Type commands and press Enter.`
  );
}
