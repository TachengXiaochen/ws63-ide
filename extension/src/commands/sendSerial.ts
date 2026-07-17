import * as vscode from "vscode";
import { cliPath, getSettings } from "../settings";
import { runCaptured } from "../executor/shell";
import { portLock } from "../diagnose/portLock";
import { preflightSerial } from "../diagnose/runner";
import { hintForCode } from "../diagnose/types";

export async function runSendSerial(): Promise<void> {
  const pre = await preflightSerial();
  if (!pre.ok) {
    vscode.window.showErrorMessage(
      `WS63 Send blocked: ${pre.message}. ${pre.fix || hintForCode(pre.code)}`
    );
    return;
  }

  const s = getSettings();
  const text = await vscode.window.showInputBox({
    title: "WS63: Send Serial Command",
    placeHolder: "e.g. AT+HELP or help",
    prompt: `Send one line to ${s.port} (${s.monitorBaud} baud)`,
  });
  if (!text) {
    return;
  }

  const ok = await portLock.acquire("send", s.port);
  if (!ok) {
    return;
  }

  try {
    const quoted = `'${text.replace(/'/g, `'\\''`)}'`;
    const cli = `'${cliPath(s).replace(/'/g, `'\\''`)}'`;
    const cmd = `python3 ${cli} write -p ${s.port} -b ${s.monitorBaud} ${quoted}`;
    const result = await runCaptured(cmd);
    if (result.code === 0) {
      vscode.window.showInformationMessage(`WS63: sent to ${s.port}: ${text}`);
    } else {
      const err = result.stderr || result.stdout || "unknown error";
      const busy = /PermissionError|busy|Access is denied/i.test(err);
      vscode.window.showErrorMessage(
        busy
          ? `WS63: port busy — ${hintForCode("PORT_BUSY")}`
          : `WS63: send failed — ${err}`
      );
    }
  } finally {
    await portLock.release(false);
  }
}
