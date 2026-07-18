import * as path from "path";
import * as vscode from "vscode";
import { runFlashJob } from "./flash";
import { firmwareAbs, getSettings } from "../settings";
import { backendClient } from "../host/backendClient";

export interface FlashJob {
  port: string;
  firmwareRel?: string;
  label?: string;
}

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

function jobsFromSettings(): FlashJob[] {
  const raw = vscode.workspace.getConfiguration("ws63").get<FlashJob[]>("flashJobs") || [];
  return raw.filter((j) => j && j.port);
}

/**
 * Interactive multi-flash: pick ports, optional per-port firmware, then queue sequentially.
 */
export async function runFlashMulti(): Promise<void> {
  const preset = jobsFromSettings();
  let jobs: FlashJob[] = [];

  if (preset.length) {
    const use = await vscode.window.showQuickPick(
      [
        { label: "Use ws63.flashJobs preset", id: "preset" },
        { label: "Pick ports interactively", id: "pick" },
      ],
      { title: "WS63 Multi Flash" }
    );
    if (!use) {
      return;
    }
    if (use.id === "preset") {
      jobs = preset;
    }
  }

  if (!jobs.length) {
    const devices = await listPortDevices();
    if (!devices.length) {
      vscode.window.showWarningMessage("No serial ports found.");
      return;
    }
    const s = getSettings();
    const picked = await vscode.window.showQuickPick(
      devices.map((d) => ({
        label: d,
        description: d === s.port ? "default port" : "",
        picked: d === s.port,
      })),
      {
        title: "Multi Flash — select ports",
        canPickMany: true,
      }
    );
    if (!picked?.length) {
      return;
    }

    const mode = await vscode.window.showQuickPick(
      [
        {
          label: "Same firmware for all",
          description: firmwareAbs(s),
          id: "same",
        },
        { label: "Pick firmware per port", id: "each" },
      ],
      { title: "Firmware mapping" }
    );
    if (!mode) {
      return;
    }

    if (mode.id === "same") {
      jobs = picked.map((p) => ({ port: p.label, firmwareRel: s.firmwareRel }));
    } else {
      for (const p of picked) {
        const fw = await vscode.window.showInputBox({
          title: `Firmware for ${p.label}`,
          value: s.firmwareRel,
          prompt: "Relative to SDK root, or absolute path",
        });
        if (!fw) {
          return;
        }
        jobs.push({ port: p.label, firmwareRel: fw });
      }
    }
  }

  const parallel = await vscode.window.showQuickPick(
    [
      { label: "Sequential (safer)", id: "seq" },
      { label: "Parallel (faster, more USB load)", id: "par" },
    ],
    { title: "Flash mode" }
  );
  if (!parallel) {
    return;
  }

  const s = getSettings();
  const results: Array<{ port: string; code: number }> = [];

  if (parallel.id === "par") {
    const codes = await Promise.all(
      jobs.map(async (job) => {
        const fw = resolveFirmware(job.firmwareRel || s.firmwareRel);
        const code = await runFlashJob(job.port, fw, { silentOfferMonitor: true });
        return { port: job.port, code };
      })
    );
    results.push(...codes);
  } else {
    for (const job of jobs) {
      const fw = resolveFirmware(job.firmwareRel || s.firmwareRel);
      const code = await runFlashJob(job.port, fw, { silentOfferMonitor: true });
      results.push({ port: job.port, code });
      if (code !== 0 && code !== 130) {
        const cont = await vscode.window.showWarningMessage(
          `Flash failed on ${job.port} (code ${code}). Continue remaining?`,
          "Continue",
          "Stop"
        );
        if (cont !== "Continue") {
          break;
        }
      }
    }
  }

  const ok = results.filter((r) => r.code === 0).length;
  const fail = results.filter((r) => r.code !== 0);
  vscode.window.showInformationMessage(
    `WS63 Multi Flash done: ${ok}/${results.length} ok` +
      (fail.length ? `; failed: ${fail.map((f) => f.port).join(", ")}` : "")
  );
}

function resolveFirmware(relOrAbs: string): string {
  const s = getSettings();
  if (path.isAbsolute(relOrAbs)) {
    return relOrAbs;
  }
  return path.join(s.sdkPath, relOrAbs);
}
