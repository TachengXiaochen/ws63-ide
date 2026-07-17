import * as vscode from "vscode";
import { getSettings } from "../settings";
import { runCaptured } from "../executor/shell";

/** Remove target build output directory (same as build.py -c pre-step, without compiling). */
export async function runCleanOutput(): Promise<void> {
  const s = getSettings();
  const outputDir = `${s.sdkPath}/output/ws63/acore/${s.target}`.replace(/\/+/g, "/");

  const pick = await vscode.window.showWarningMessage(
    `Delete build output for ${s.target}?\n${outputDir}`,
    { modal: true },
    "Clean"
  );
  if (pick !== "Clean") {
    return;
  }

  const cmd = `rm -rf '${outputDir.replace(/'/g, `'\\''`)}' && echo 'Cleaned: ${outputDir}'`;
  const result = await runCaptured(cmd);
  if (result.code === 0) {
    vscode.window.showInformationMessage(`WS63: cleaned ${s.target} output`);
  } else {
    vscode.window.showErrorMessage(
      `WS63: clean failed — ${result.stderr || result.stdout || "unknown error"}`
    );
  }
}
