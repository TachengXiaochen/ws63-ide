import * as vscode from "vscode";
import { getSettings } from "../settings";
import { portLock } from "../diagnose/portLock";
import { preflightSerial } from "../diagnose/runner";
import { offerRecovery } from "../diagnose/recover";
import { backendClient } from "../host/backendClient";

export async function runSendSerial(): Promise<void> {
  const pre = await preflightSerial();
  if (!pre.ok) {
    await offerRecovery(pre.code, "Send blocked", pre.message);
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
    const result = await backendClient.write(s.port, text);
    if (result.code === 0) {
      vscode.window.showInformationMessage(`WS63: sent to ${s.port}: ${text}`);
    } else {
      const err = result.stderr || result.stdout || "unknown error";
      const busy = /PermissionError|busy|Access is denied/i.test(err);
      const again = await offerRecovery(
        busy ? "PORT_BUSY" : "UNKNOWN",
        "Send failed",
        err.slice(0, 200)
      );
      if (again === "retry") {
        await portLock.releasePort(s.port, false);
        return runSendSerial();
      }
    }
  } finally {
    await portLock.releasePort(s.port, false);
  }
}
