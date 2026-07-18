import * as vscode from "vscode";
import { getSettings } from "../settings";
import { backendClient } from "../host/backendClient";
import { runStreamingSpec } from "../executor/stream";

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

  const result = await runStreamingSpec({
    file: "rm",
    args: ["-rf", outputDir],
    cwd: s.sdkPath,
  });
  if (result.code === 0) {
    vscode.window.showInformationMessage(`WS63: cleaned ${s.target} output`);
  } else {
    vscode.window.showErrorMessage(
      `WS63: clean failed — ${result.stderr || result.stdout || "unknown error"}`
    );
  }
}
