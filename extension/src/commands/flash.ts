import * as vscode from "vscode";
import { FlashLogPresenter } from "../executor/logPresenter";
import { FlashProgressTracker } from "../executor/progressTracker";
import { runStreamingSpec } from "../executor/stream";
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
import { firmwareAbs, getSettings } from "../settings";
import { portLock } from "../diagnose/portLock";
import { preflightFlash } from "../diagnose/runner";
import { classifyFlashFailure, hintForCode } from "../diagnose/types";
import { offerRecovery } from "../diagnose/recover";
import { backendClient } from "../host/backendClient";
import { argvToShell } from "../host/adapter";

let resetPromptShown = false;
let flashUiDone = false;

function finishFlashUi(
  tracker: FlashProgressTracker,
  detail: string,
  port: string
): void {
  if (flashUiDone) {
    return;
  }
  flashUiDone = true;
  tracker.forceComplete(detail);
  ProgressPanel.get().finish("success", "Flash 成功", detail);
  showFlashToast(`WS63 Flash 完成 (${port})`);
}

function updateFlashPanel(tracker: FlashProgressTracker, port: string): void {
  const snap = tracker.snapshot;
  ProgressPanel.get().update({
    overall: snap.overall,
    title: `WS63 Flash (${port})`,
    stage: snap.stage,
    detail: snap.detail,
    fileIndex: snap.fileIndex,
    fileTotal: snap.fileTotal,
    bins: snap.bins,
    status: "running",
  });
}

async function promptResetBoard(port: string): Promise<void> {
  if (resetPromptShown) {
    return;
  }
  resetPromptShown = true;

  const choice = await vscode.window.showWarningMessage(
    `WS63 Flash (${port})：请现在按开发板 RST 复位键`,
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

export interface FlashJobOptions {
  silentOfferMonitor?: boolean;
  retries?: number;
}

export async function runFlashJob(
  port: string,
  firmwareAbsPath: string,
  opts: FlashJobOptions = {}
): Promise<number> {
  resetPromptShown = false;
  flashUiDone = false;
  const s = getSettings();
  const retries = opts.retries ?? s.flashRetries ?? 0;

  const locked = await portLock.acquireForFlash(port);
  if (!locked) {
    return 2;
  }

  let lastCode = 1;
  try {
    for (let attempt = 0; attempt <= retries; attempt++) {
      if (attempt > 0) {
        logHint(`Flash retry ${attempt}/${retries} on ${port}…`);
        showFlashToast(`Flash 重试 ${attempt}/${retries} (${port})`, "warn");
      }

      resetPromptShown = false;
      flashUiDone = false;

      const spec = backendClient.flash({
        port,
        firmware: firmwareAbsPath,
        baud: s.flashBaud,
        timeout: s.flashTimeout,
      });
      const cmdLabel = argvToShell([spec.file, ...spec.args]);

      ProgressPanel.get().show(`WS63 Flash (${port})`);
      ProgressPanel.get().update({
        overall: 0,
        title: `WS63 Flash (${port})`,
        stage: attempt ? `重试 ${attempt}…` : "准备烧录…",
        detail: "等待 ws63flash 启动",
        status: "running",
      });

      beginTask(`Flash (${port})`, cmdLabel);
      const presenter = new FlashLogPresenter();
      const tracker = new FlashProgressTracker();
      logHint(">>> 出现 Waiting for device reset 后按 RST；可随时点 Stop 取消 <<<");

      const result = await runStreamingSpec(spec, {
        ignoreCancel: () => flashUiDone,
        onLine(line, stream) {
          const progressMatch = line.match(/^\[ws63:progress\]\s+(\S+)\s+(\d+)/);
          if (progressMatch) {
            tracker.onXfer(progressMatch[1], parseInt(progressMatch[2], 10));
            updateFlashPanel(tracker, port);
            return;
          }

          tracker.parseBinRow(line);
          const parsed = presenter.processLine(line);

          if (presenter.isWaitingForReset(line)) {
            tracker.setStage("等待 RST 复位…");
            updateFlashPanel(tracker, port);
            void promptResetBoard(port);
          } else if (/^\|/.test(line.trim()) || line.includes("BIN NAME")) {
            tracker.setStage("解析固件包…");
            updateFlashPanel(tracker, port);
          } else if (/Establishing ymodem/i.test(line)) {
            tracker.setStage("YModem 握手…");
            updateFlashPanel(tracker, port);
          } else if (parsed.xfer) {
            tracker.onXfer(parsed.xfer.file, parsed.xfer.percent);
            updateFlashPanel(tracker, port);
          } else if (/Done\.|Reseting device|Resetting device/i.test(line)) {
            finishFlashUi(tracker, "烧录完成，设备复位中…", port);
          } else if (presenter.isTimeout(line)) {
            tracker.setStage("超时");
            updateFlashPanel(tracker, port);
          } else if (/stopping/i.test(line)) {
            tracker.setStage("正在停止…");
            updateFlashPanel(tracker, port);
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
          if (!opts.silentOfferMonitor) {
            await offerMonitorAfterFlash(port);
          }
          return 0;
        }
        logCancelled(`Flash cancelled (${port})`);
        ProgressPanel.get().finish("cancelled", "Flash 已取消", "用户停止");
        showFlashToast("WS63 Flash 已停止", "warn");
        return 130;
      }

      if (result.code === 0) {
        logSuccess(`Flash succeeded (${port})`);
        finishFlashUi(tracker, "烧录完成", port);
        if (!opts.silentOfferMonitor) {
          await offerMonitorAfterFlash(port);
        }
        return 0;
      }

      lastCode = result.code;
      const errCode = classifyFlashFailure(result.stdout, result.stderr, result.code);
      const hint = hintForCode(errCode);
      logFailure(`Flash failed (code ${result.code}) [${errCode}] on ${port}`);
      logHint(hint);

      const retryable =
        errCode === "RESET_TIMEOUT" || errCode === "PORT_BUSY" || errCode === "UNKNOWN";
      if (!retryable || attempt >= retries) {
        ProgressPanel.get().finish("error", "Flash 失败", hint);
        showFlashToast(`WS63 Flash 失败 (${port}): ${hint}`, "error");
        const recovered = await offerRecovery(
          errCode,
          `Flash failed on ${port}`,
          hint
        );
        if (recovered === "retry") {
          attempt--;
          continue;
        }
        return result.code;
      }
    }
    return lastCode;
  } finally {
    await portLock.releasePort(port, false);
  }
}

export async function runFlash(): Promise<number> {
  const s = getSettings();

  const pre = await preflightFlash();
  if (!pre.ok) {
    logFailure(`Flash preflight: ${pre.message}`);
    if (pre.fix) {
      logHint(pre.fix);
    }
    showFlashToast(`Flash 已阻止: ${pre.message}`, "error");
    const again = await offerRecovery(pre.code, "Flash blocked", pre.message);
    if (again === "retry") {
      return runFlash();
    }
    return 2;
  }

  return runFlashJob(s.port, firmwareAbs(s));
}

async function offerMonitorAfterFlash(port?: string): Promise<void> {
  const choice = await vscode.window.showInformationMessage(
    `Flash 成功${port ? ` (${port})` : ""}。打开 Monitor？`,
    "Open Monitor",
    "Later"
  );
  if (choice === "Open Monitor") {
    if (port) {
      const cfg = vscode.workspace.getConfiguration("ws63");
      await cfg.update("port", port, vscode.ConfigurationTarget.Workspace);
    }
    await vscode.commands.executeCommand("ws63.monitor");
  }
}
