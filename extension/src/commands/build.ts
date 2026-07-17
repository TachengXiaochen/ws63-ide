import * as vscode from "vscode";
import { BuildLogPresenter } from "../executor/logPresenter";
import { BuildProgressTracker } from "../executor/progressTracker";
import { runStreaming } from "../executor/stream";
import {
  beginTask,
  logBuildLine,
  logCancelled,
  logFailure,
  logSection,
  logSuccess,
  logTailLine,
} from "../output/channel";
import { ProgressPanel } from "../ui/progressPanel";
import { getSettings } from "../settings";

export async function runBuild(clean: boolean): Promise<number> {
  const s = getSettings();
  const flag = clean ? "-c" : "";
  const cmd = `cd ${s.sdkPath} && ./build.py ${flag} ${s.target}`.replace(/\s+/g, " ").trim();
  const title = `WS63 Build (${s.target})`;
  const tracker = new BuildProgressTracker();

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
      beginTask(title, cmd);
      const presenter = new BuildLogPresenter();

      progress.report({ message: "starting..." });

      const result = await runStreaming(cmd, {
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
        logFailure(`Build failed (code ${result.code})`);
        ProgressPanel.get().finish("error", "编译失败", `退出码 ${result.code}`);
        const tail = [...result.stdout.split("\n"), ...result.stderr.split("\n")]
          .filter(Boolean)
          .slice(-30);
        if (tail.length) {
          logSection("last lines (full log tail)");
          tail.forEach((l) => logTailLine(l));
        }
        vscode.window.showErrorMessage(`WS63: Build failed (code ${result.code})`);
      }
      return result.code;
    }
  );
}

export async function runMenuconfig(): Promise<void> {
  const s = getSettings();
  const cmd = `cd ${s.sdkPath} && ./build.py menuconfig`;
  const terminal = vscode.window.createTerminal("WS63 Menuconfig");
  terminal.show();
  terminal.sendText(cmd, true);
}
