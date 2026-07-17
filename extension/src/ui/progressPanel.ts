import * as vscode from "vscode";

export interface ProgressSnapshot {
  overall: number;
  title: string;
  stage: string;
  detail: string;
  fileIndex?: number;
  fileTotal?: number;
  bins?: { name: string; done: boolean; active: boolean }[];
  status?: "running" | "success" | "error" | "cancelled";
}

const AUTO_CLOSE_MS = 4000;

/** BurnTool-style progress panel (Webview) with close button. */
export class ProgressPanel {
  private static instance: ProgressPanel | undefined;
  private panel: vscode.WebviewPanel | undefined;
  private autoCloseTimer: ReturnType<typeof setTimeout> | undefined;

  private constructor(private readonly context: vscode.ExtensionContext) {}

  static init(context: vscode.ExtensionContext): ProgressPanel {
    if (!ProgressPanel.instance) {
      ProgressPanel.instance = new ProgressPanel(context);
      context.subscriptions.push({ dispose: () => ProgressPanel.instance?.dispose() });
    }
    return ProgressPanel.instance;
  }

  static get(): ProgressPanel {
    if (!ProgressPanel.instance) {
      throw new Error("ProgressPanel not initialized");
    }
    return ProgressPanel.instance;
  }

  show(title: string): void {
    this.clearAutoClose();
    if (this.panel) {
      this.panel.title = title;
      this.panel.reveal(vscode.ViewColumn.Beside, false);
      return;
    }
    this.panel = vscode.window.createWebviewPanel(
      "ws63Progress",
      title,
      vscode.ViewColumn.Beside,
      { enableScripts: true, retainContextWhenHidden: true }
    );
    this.panel.iconPath = vscode.Uri.joinPath(this.context.extensionUri, "media", "chip.svg");
    this.panel.webview.onDidReceiveMessage((msg) => {
      if (msg?.type === "close") {
        this.dispose();
      }
    });
    this.panel.onDidDispose(() => {
      this.clearAutoClose();
      this.panel = undefined;
    });
    this.context.subscriptions.push(this.panel);
  }

  update(s: ProgressSnapshot): void {
    if (!this.panel) {
      this.show(s.title);
    }
    this.panel!.webview.html = this.render(s);
  }

  finish(status: "success" | "error" | "cancelled", title: string, detail: string): void {
    this.update({
      overall: status === "success" ? 100 : this.lastOverall,
      title,
      stage: detail,
      detail: status === "success" ? "几秒后自动关闭，也可点右上角 ×" : "",
      status,
    });
    if (status === "success") {
      this.scheduleAutoClose(AUTO_CLOSE_MS);
    }
  }

  private scheduleAutoClose(ms: number): void {
    this.clearAutoClose();
    this.autoCloseTimer = setTimeout(() => this.dispose(), ms);
  }

  private clearAutoClose(): void {
    if (this.autoCloseTimer) {
      clearTimeout(this.autoCloseTimer);
      this.autoCloseTimer = undefined;
    }
  }

  private lastOverall = 0;

  private render(s: ProgressSnapshot): string {
    this.lastOverall = s.overall;
    const pct = Math.max(0, Math.min(100, s.overall));
    const barColor =
      s.status === "success"
        ? "#3fb950"
        : s.status === "error"
          ? "#f85149"
          : s.status === "cancelled"
            ? "#d29922"
            : "#3794ff";

    const fileList =
      s.bins && s.bins.length
        ? `<ul class="files">${s.bins
            .map((b) => {
              const icon = b.done ? "✓" : b.active ? "▶" : "○";
              const cls = b.done ? "done" : b.active ? "active" : "";
              const short = b.name.length > 36 ? "…" + b.name.slice(-33) : b.name;
              return `<li class="${cls}"><span class="icon">${icon}</span>${short}</li>`;
            })
            .join("")}</ul>`
        : "";

    const counter =
      s.fileTotal && s.fileTotal > 0
        ? `<div class="counter">文件 ${s.fileIndex ?? 0} / ${s.fileTotal}</div>`
        : "";

    return `<!DOCTYPE html>
<html lang="zh">
<head>
<meta charset="UTF-8">
<meta http-equiv="Content-Security-Policy" content="default-src 'none'; style-src 'unsafe-inline'; script-src 'unsafe-inline';">
<style>
  * { box-sizing: border-box; margin: 0; padding: 0; }
  body {
    font-family: var(--vscode-font-family, system-ui, sans-serif);
    background: var(--vscode-editor-background, #1e1e1e);
    color: var(--vscode-editor-foreground, #ccc);
    padding: 16px 20px 20px;
    min-width: 280px;
  }
  .header { display: flex; align-items: flex-start; justify-content: space-between; gap: 8px; margin-bottom: 4px; }
  h2 { font-size: 15px; font-weight: 600; flex: 1; }
  .close {
    border: none; background: transparent; color: var(--vscode-foreground, #ccc);
    font-size: 18px; line-height: 1; cursor: pointer; padding: 0 4px; border-radius: 4px;
  }
  .close:hover { background: var(--vscode-toolbar-hoverBackground, #444); }
  .stage { font-size: 13px; color: var(--vscode-descriptionForeground, #999); margin-bottom: 16px; }
  .bar-wrap {
    background: var(--vscode-progressBar-background, #333);
    border-radius: 6px;
    height: 22px;
    overflow: hidden;
    position: relative;
    margin-bottom: 8px;
  }
  .bar {
    height: 100%;
    width: ${pct}%;
    background: ${barColor};
    border-radius: 6px;
    transition: width 0.35s ease;
  }
  .pct {
    position: absolute;
    inset: 0;
    display: flex;
    align-items: center;
    justify-content: center;
    font-size: 12px;
    font-weight: 700;
    color: #fff;
    text-shadow: 0 1px 2px rgba(0,0,0,.5);
  }
  .detail { font-size: 12px; margin-bottom: 12px; word-break: break-all; color: #888; }
  .counter { font-size: 11px; color: var(--vscode-descriptionForeground, #888); margin-bottom: 8px; }
  .files { list-style: none; font-size: 11px; max-height: 180px; overflow-y: auto; }
  .files li { padding: 3px 0; color: #888; display: flex; gap: 6px; align-items: center; }
  .files li.active { color: #3794ff; font-weight: 600; }
  .files li.done { color: #3fb950; }
  .icon { width: 14px; text-align: center; flex-shrink: 0; }
</style>
</head>
<body>
  <div class="header">
    <h2>${esc(s.title)}</h2>
    <button class="close" id="btn-close" title="关闭">×</button>
  </div>
  <div class="stage">${esc(s.stage)}</div>
  <div class="bar-wrap">
    <div class="bar"></div>
    <div class="pct">${pct}%</div>
  </div>
  ${counter}
  <div class="detail">${esc(s.detail)}</div>
  ${fileList}
  <script>
    (function() {
      const vscode = acquireVsCodeApi();
      document.getElementById('btn-close').addEventListener('click', function() {
        vscode.postMessage({ type: 'close' });
      });
    })();
  </script>
</body>
</html>`;
  }

  dispose(): void {
    this.clearAutoClose();
    this.panel?.dispose();
    this.panel = undefined;
  }
}

function esc(s: string): string {
  return s
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}
