import * as vscode from "vscode";
import { BuildLogPresenter } from "../executor/logPresenter";
import { BuildProgressTracker } from "../executor/progressTracker";
import { runStreamingSpec } from "../executor/stream";
import {
  beginTask,
  logBuildLine,
  logCancelled,
  logFailure,
  logSection,
  logSuccess,
  logTailLine,
} from "../output/channel";
import {
  clearBuildDiagnostics,
  publishBuildDiagnostics,
} from "../output/diagnostics";
import { ProgressPanel } from "../ui/progressPanel";
import { getSettings } from "../settings";
import { backendClient } from "../host/backendClient";
import { argvToShell } from "../host/adapter";
import { offerRecovery } from "../diagnose/recover";

export async function runBuild(clean: boolean): Promise<number> {
  const s = getSettings();
  let spec;
  try {
    spec = backendClient.build(clean);
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    await offerRecovery("SDK_INVALID", "Build blocked", msg);
    return 2;
  }

  const title = `WS63 Build (${s.target})`;
  const tracker = new BuildProgressTracker();
  clearBuildDiagnostics();

  ProgressPanel.get().show(title);
  ProgressPanel.get().update({
    overall: 0,
    title,
    stage: clean ? "全量编译…" : "增量编译…",
    detail: "启动 build.py",
    status: "running",
  });

  return vscode.window.withProgress(
    {
      location: vscode.ProgressLocation.Window,
      title: "WS63 Build",
      cancellable: true,
    },
    async (progress, token) => {
      beginTask(title, argvToShell([spec.file, ...spec.args]));
      const presenter = new BuildLogPresenter();

      progress.report({ message: "starting..." });

      const result = await runStreamingSpec(spec, {
        token,
        onLine(line, stream) {
          const prog = presenter.parseProgress(line);
          if (prog) {
            const overall = tracker.onNinja(prog.current, prog.total, prog.label);
            const increment = tracker.delta(overall);
            progress.report({
              message: `${prog.current}/${prog.total} (${prog.percent}%)`,
              increment,
            });
            ProgressPanel.get().update({
              overall,
              title,
              stage: tracker.stageText,
              detail: `${prog.current} / ${prog.total} 目标`,
              status: "running",
            });
          }

          if (presenter.shouldEmit(line)) {
            logBuildLine(line, stream);
          }
        },
      });

      if (result.cancelled) {
        logCancelled("Build cancelled");
        ProgressPanel.get().finish("cancelled", "编译已取消", "用户停止");
        vscode.window.showWarningMessage("WS63: Build 已停止");
        return 130;
      }

      if (result.code === 0) {
        logSuccess("Build succeeded");
        ProgressPanel.get().finish("success", "编译成功", s.target);
        vscode.window.showInformationMessage(`WS63: Build succeeded (${s.target})`);
      } else {
        const n = publishBuildDiagnostics(
          `${result.stdout}\n${result.stderr}`,
          s.sdkPath
        );
        logFailure(`Build failed (code ${result.code})`);
        ProgressPanel.get().finish("error", "编译失败", `退出码 ${result.code}`);
        const tail = [...result.stdout.split("\n"), ...result.stderr.split("\n")]
          .filter(Boolean)
          .slice(-30);
        if (tail.length) {
          logSection("last lines (full log tail)");
          tail.forEach((l) => logTailLine(l));
        }
        vscode.window.showErrorMessage(
          n
            ? `WS63: Build failed — ${n} issue(s) in Problems`
            : `WS63: Build failed (code ${result.code})`
        );
      }
      return result.code;
    }
  );
}

export async function runMenuconfig(): Promise<void> {
  const s = getSettings();
  const warn = await vscode.window.showWarningMessage(
    "Terminal menuconfig writes the same .config as SDK Configuration Editor. " +
      "Close SDK Config first to avoid conflicts.",
    "Open Terminal",
    "Open SDK Config",
    "Cancel"
  );
  if (warn === "Open SDK Config") {
    await vscode.commands.executeCommand("ws63.sdkConfig");
    return;
  }
  if (warn !== "Open Terminal") {
    return;
  }
  const { createTerminal, sendSpecToTerminal } = await import("../executor/shell");
  const terminal = createTerminal("WS63 Menuconfig");
  terminal.show();
  sendSpecToTerminal(terminal, {
    file: "./build.py",
    args: ["menuconfig"],
    cwd: s.sdkPath,
  });
}
