import * as vscode from "vscode";
import { FlashLogPresenter } from "../executor/logPresenter";
import { FlashProgressTracker } from "../executor/progressTracker";
import { runStreaming } from "../executor/stream";
import {
  beginTask,
  logCancelled,
  logFailure,
  logFlashLine,
  logHint,
  logSuccess,
} from "../output/channel";
import { showFlashToast } from "../ui/flashToast";
import { ProgressPanel } from "../ui/progressPanel";
import { cliPath, firmwareAbs, getSettings } from "../settings";
import { portLock } from "../diagnose/portLock";
import { preflightFlash } from "../diagnose/runner";
import { classifyFlashFailure, hintForCode } from "../diagnose/types";

let resetPromptShown = false;
let flashUiDone = false;

function finishFlashUi(tracker: FlashProgressTracker, detail: string): void {
  if (flashUiDone) {
    return;
  }
  flashUiDone = true;
  tracker.forceComplete(detail);
  ProgressPanel.get().finish("success", "Flash 成功", detail);
  showFlashToast("WS63 Flash 完成");
}

function updateFlashPanel(tracker: FlashProgressTracker): void {
  const snap = tracker.snapshot;
  const s = getSettings();
  ProgressPanel.get().update({
    overall: snap.overall,
    title: `WS63 Flash (${s.port})`,
    stage: snap.stage,
    detail: snap.detail,
    fileIndex: snap.fileIndex,
    fileTotal: snap.fileTotal,
    bins: snap.bins,
    status: "running",
  });
}

async function promptResetBoard(): Promise<void> {
  if (resetPromptShown) {
    return;
  }
  resetPromptShown = true;

  const choice = await vscode.window.showWarningMessage(
    "WS63 Flash：请现在按开发板 RST 复位键",
    {
      modal: true,
      detail:
        "ws63flash 已进入「Waiting for device reset」状态。\n" +
        "请短按 RST 让芯片进入烧录模式，否则将超时失败。\n\n" +
        "若仍无响应：关闭 SSCOM/BurnTool → 重新插拔 USB → 再按 Flash。",
    },
    "知道了"
  );
  if (!choice) {
    resetPromptShown = false;
  }
}

export async function runFlash(): Promise<number> {
  resetPromptShown = false;
  flashUiDone = false;
  const s = getSettings();

  const pre = await preflightFlash();
  if (!pre.ok) {
    logFailure(`Flash preflight: ${pre.message}`);
    if (pre.fix) {
      logHint(pre.fix);
    }
    showFlashToast(`Flash 已阻止: ${pre.message}`, "error");
    vscode.window.showErrorMessage(
      `WS63 Flash blocked: ${pre.message}. ${pre.fix || hintForCode(pre.code)}`
    );
    return 2;
  }

  const locked = await portLock.acquireForFlash(s.port);
  if (!locked) {
    return 2;
  }

  const fw = firmwareAbs(s);
  const cli = `'${cliPath(s).replace(/'/g, `'\\''`)}'`;
  const cmd = [
    `python3 ${cli} flash`,
    `-p ${s.port}`,
    `-f '${fw.replace(/'/g, `'\\''`)}'`,
    `-b ${s.flashBaud}`,
    `-t ${s.flashTimeout}`,
  ].join(" ");

  ProgressPanel.get().show(`WS63 Flash (${s.port})`);
  ProgressPanel.get().update({
    overall: 0,
    title: `WS63 Flash (${s.port})`,
    stage: "准备烧录…",
    detail: "等待 ws63flash 启动",
    status: "running",
  });

  beginTask(`Flash (${s.port})`, cmd);
  const presenter = new FlashLogPresenter();
  const tracker = new FlashProgressTracker();

  logHint(">>> 出现 Waiting for device reset 后按 RST；可随时点 Stop 取消 <<<");

  try {
    const result = await runStreaming(cmd, {
      ignoreCancel: () => flashUiDone,
      onLine(line, stream) {
        const progressMatch = line.match(/^\[ws63:progress\]\s+(\S+)\s+(\d+)/);
        if (progressMatch) {
          tracker.onXfer(progressMatch[1], parseInt(progressMatch[2], 10));
          updateFlashPanel(tracker);
          return;
        }

        tracker.parseBinRow(line);
        const parsed = presenter.processLine(line);

        if (presenter.isWaitingForReset(line)) {
          tracker.setStage("等待 RST 复位…");
          updateFlashPanel(tracker);
          void promptResetBoard();
        } else if (/^\|/.test(line.trim()) || line.includes("BIN NAME")) {
          tracker.setStage("解析固件包…");
          updateFlashPanel(tracker);
        } else if (/Establishing ymodem/i.test(line)) {
          tracker.setStage("YModem 握手…");
          updateFlashPanel(tracker);
        } else if (parsed.xfer) {
          tracker.onXfer(parsed.xfer.file, parsed.xfer.percent);
          updateFlashPanel(tracker);
        } else if (/Done\.|Reseting device|Resetting device/i.test(line)) {
          finishFlashUi(tracker, "烧录完成，设备复位中…");
        } else if (presenter.isTimeout(line)) {
          tracker.setStage("超时");
          updateFlashPanel(tracker);
        } else if (/stopping/i.test(line)) {
          tracker.setStage("正在停止…");
          updateFlashPanel(tracker);
        }

        if (parsed.etaHint) {
          logHint(parsed.etaHint);
        }
        if (parsed.display) {
          logFlashLine(parsed.display, stream);
        }
      },
    });

    if (result.cancelled) {
      if (flashUiDone) {
        await offerMonitorAfterFlash();
        return 0;
      }
      logCancelled("Flash cancelled");
      ProgressPanel.get().finish("cancelled", "Flash 已取消", "用户停止");
      showFlashToast("WS63 Flash 已停止", "warn");
      return 130;
    }

    if (result.code === 0) {
      logSuccess("Flash succeeded");
      finishFlashUi(tracker, "烧录完成");
      await offerMonitorAfterFlash();
      return 0;
    }

    const errCode = classifyFlashFailure(result.stdout, result.stderr, result.code);
    const hint = hintForCode(errCode);
    logFailure(`Flash failed (code ${result.code}) [${errCode}]`);
    logHint(hint);
    ProgressPanel.get().finish("error", "Flash 失败", hint);
    showFlashToast(`WS63 Flash 失败: ${hint}`, "error");
    return result.code;
  } finally {
    await portLock.release(false);
  }
}

async function offerMonitorAfterFlash(): Promise<void> {
  const choice = await vscode.window.showInformationMessage(
    "Flash 成功。打开 Monitor？",
    "Open Monitor",
    "Later"
  );
  if (choice === "Open Monitor") {
    await vscode.commands.executeCommand("ws63.monitor");
  }
}
