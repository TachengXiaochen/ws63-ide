import * as vscode from "vscode";
import { getSettings } from "../settings";
import {
  getOrCreateDebugTerminal,
  sendSpecToTerminal,
} from "../executor/shell";
import { portLock } from "../diagnose/portLock";
import { preflightSerial } from "../diagnose/runner";
import { offerRecovery } from "../diagnose/recover";
import { backendClient } from "../host/backendClient";

export async function runDebugConsole(): Promise<void> {
  const pre = await preflightSerial();
  if (!pre.ok) {
    await offerRecovery(pre.code, "Debug Console blocked", pre.message);
    return;
  }

  const s = getSettings();
  const ok = await portLock.acquire("debug", s.port);
  if (!ok) {
    return;
  }

  const spec = backendClient.console(s.port);
  const terminal = getOrCreateDebugTerminal(s.port);
  portLock.bindTerminal("debug", s.port, terminal);
  terminal.show(true);
  sendSpecToTerminal(terminal, spec);
  vscode.window.showInformationMessage(
    `WS63 Debug Console on ${s.port}. Type commands and press Enter.`
  );
}
