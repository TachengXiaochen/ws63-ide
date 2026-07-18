import * as vscode from "vscode";
import { getSettings } from "../settings";
import {
  createMonitorTerminal,
  getOrCreateMonitorTerminal,
  sendSpecToTerminal,
} from "../executor/shell";
import { portLock } from "../diagnose/portLock";
import { preflightSerial } from "../diagnose/runner";
import { hintForCode } from "../diagnose/types";
import { offerRecovery } from "../diagnose/recover";
import { backendClient } from "../host/backendClient";

async function listPortDevices(): Promise<string[]> {
  const result = await backendClient.ports();
  return result.stdout
    .split("\n")
    .map((l) => l.trim())
    .filter(Boolean)
    .filter((l) => !l.startsWith("No serial"))
    .map((line) => line.split("\t")[0])
    .filter(Boolean);
}

async function startMonitorOnPort(port: string, freshTerminal: boolean): Promise<boolean> {
  const ok = await portLock.acquire("monitor", port);
  if (!ok) {
    return false;
  }
  const spec = backendClient.monitor(port);
  const terminal = freshTerminal
    ? createMonitorTerminal(port)
    : getOrCreateMonitorTerminal(port);
  portLock.bindTerminal("monitor", port, terminal);
  terminal.show(true);
  sendSpecToTerminal(terminal, spec);
  return true;
}

export async function runMonitor(): Promise<void> {
  const pre = await preflightSerial();
  if (!pre.ok) {
    const again = await offerRecovery(pre.code, "Monitor blocked", pre.message);
    if (again === "retry") {
      return runMonitor();
    }
    return;
  }

  const s = getSettings();
  const started = await startMonitorOnPort(s.port, false);
  if (!started) {
    return;
  }
  vscode.window.showInformationMessage(
    `WS63 Monitor on ${s.port}. Close SSCOM/BurnTool if the port stays busy.`
  );
}

export async function runMonitorMulti(): Promise<void> {
  const pre = await preflightSerial();
  if (!pre.ok) {
    await offerRecovery(pre.code, "Multi Monitor blocked", pre.message);
    return;
  }

  const devices = await listPortDevices();
  if (!devices.length) {
    await offerRecovery("PORT_NONE", "No serial ports found");
    return;
  }

  const s = getSettings();
  const picked = await vscode.window.showQuickPick(
    devices.map((d) => ({
      label: d,
      description: d === s.port ? "default" : "",
      picked: d === s.port,
    })),
    {
      title: "WS63 Multi Monitor",
      placeHolder: "Select one or more ports",
      canPickMany: true,
    }
  );
  if (!picked?.length) {
    return;
  }

  let n = 0;
  for (const item of picked) {
    if (await startMonitorOnPort(item.label, true)) {
      n++;
    }
  }
  vscode.window.showInformationMessage(
    `WS63: started Monitor on ${n} port(s). Each has its own terminal.`
  );
}
