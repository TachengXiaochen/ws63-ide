import * as vscode from "vscode";
import { runBuild } from "./build";
import { runMenuconfig } from "./build";
import { createQuickConfigProvider, QUICK_CONFIG_SYMBOLS } from "../providers/fileConfigProvider";
import { getSettings } from "../settings";

let panel: vscode.WebviewPanel | undefined;
let provider = createQuickConfigProvider();

function esc(s: string): string {
  return s
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

function renderHtml(target: string, nodes: { id: string; name: string; value: boolean }[]): string {
  const rows = nodes
    .map(
      (n) =>
        `<label class="row"><input type="checkbox" data-id="${esc(n.id)}" ${
          n.value ? "checked" : ""
        } /> ${esc(n.name)}</label>`
    )
    .join("\n");

  return `<!DOCTYPE html>
<html lang="zh">
<head>
<meta charset="UTF-8">
<meta http-equiv="Content-Security-Policy" content="default-src 'none'; style-src 'unsafe-inline'; script-src 'unsafe-inline';">
<style>
  body { font-family: var(--vscode-font-family); padding: 16px; color: var(--vscode-foreground); background: var(--vscode-editor-background); }
  h2 { font-size: 14px; margin: 0 0 4px; }
  .meta { font-size: 11px; color: var(--vscode-descriptionForeground); margin-bottom: 16px; }
  .row { display: block; margin: 10px 0; cursor: pointer; font-size: 13px; }
  .row input { margin-right: 8px; }
  .actions { margin-top: 20px; display: flex; gap: 8px; flex-wrap: wrap; }
  button { padding: 6px 14px; cursor: pointer; border: none; border-radius: 4px; font-size: 12px; }
  .primary { background: var(--vscode-button-background); color: var(--vscode-button-foreground); }
  .secondary { background: var(--vscode-button-secondaryBackground); color: var(--vscode-button-secondaryForeground); }
  .msg { margin-top: 12px; font-size: 11px; color: var(--vscode-descriptionForeground); min-height: 16px; }
  .warn { color: var(--vscode-editorWarning-foreground, #cca700); }
</style>
</head>
<body>
  <h2>WS63 Quick Config</h2>
  <div class="meta">Target: ${esc(target)} · SLE Throughput</div>
  ${rows}
  <div class="actions">
    <button class="secondary" id="btn-revert">Revert</button>
    <button class="primary" id="btn-save">Save</button>
    <button class="primary" id="btn-save-build">Save &amp; Build</button>
    <button class="secondary" id="btn-menuconfig">Terminal menuconfig</button>
  </div>
  <div class="msg" id="msg"></div>
  <script>
    const vscode = acquireVsCodeApi();
    function collect() {
      const out = {};
      document.querySelectorAll('input[data-id]').forEach(el => {
        out[el.getAttribute('data-id')] = el.checked;
      });
      return out;
    }
    document.getElementById('btn-save').onclick = () => vscode.postMessage({ type: 'save', values: collect() });
    document.getElementById('btn-save-build').onclick = () => vscode.postMessage({ type: 'saveBuild', values: collect() });
    document.getElementById('btn-revert').onclick = () => vscode.postMessage({ type: 'revert' });
    document.getElementById('btn-menuconfig').onclick = () => vscode.postMessage({ type: 'menuconfig' });
    window.addEventListener('message', e => {
      const m = e.data;
      if (m.type === 'status') document.getElementById('msg').textContent = m.text || '';
      if (m.type === 'warn') document.getElementById('msg').innerHTML = '<span class="warn">' + m.text + '</span>';
      if (m.type === 'reload') {
        Object.entries(m.values || {}).forEach(([k, v]) => {
          const el = document.querySelector('input[data-id="' + k + '"]');
          if (el) el.checked = !!v;
        });
      }
    });
  </script>
</body>
</html>`;
}

async function refreshPanel(): Promise<void> {
  if (!panel) {
    return;
  }
  const nodes = await provider.loadTree();
  const s = getSettings();
  panel.webview.html = renderHtml(
    s.target,
    nodes.map((n) => ({
      id: n.id,
      name: n.name,
      value: n.value === true,
    }))
  );
}

export async function runQuickConfig(): Promise<void> {
  const s = getSettings();
  provider = createQuickConfigProvider();

  if (panel) {
    panel.reveal(vscode.ViewColumn.Beside);
    await refreshPanel();
    return;
  }

  panel = vscode.window.createWebviewPanel(
    "ws63QuickConfig",
    "WS63 Quick Config",
    vscode.ViewColumn.Beside,
    { enableScripts: true, retainContextWhenHidden: true }
  );

  panel.onDidDispose(() => {
    panel = undefined;
  });

  panel.webview.onDidReceiveMessage(async (msg) => {
    try {
      if (msg.type === "revert") {
        await provider.revert();
        const nodes = await provider.loadTree();
        const values: Record<string, boolean> = {};
        nodes.forEach((n) => {
          values[n.id] = n.value === true;
        });
        panel?.webview.postMessage({ type: "reload", values });
        panel?.webview.postMessage({ type: "status", text: "已恢复为磁盘上的配置" });
        return;
      }
      if (msg.type === "menuconfig") {
        await runMenuconfig();
        return;
      }
      if (msg.type === "save" || msg.type === "saveBuild") {
        const values = msg.values as Record<string, boolean>;
        if (values.SLE_TP_APP_SERVER && values.SLE_TP_APP_CLIENT) {
          panel?.webview.postMessage({
            type: "warn",
            text: "Server 与 Client 同时启用：联调时通常 WS63=RX、WS73=TX，请确认角色。",
          });
        }
        for (const sym of QUICK_CONFIG_SYMBOLS) {
          await provider.setValue(sym.id, values[sym.id]);
        }
        await provider.save();
        panel?.webview.postMessage({ type: "status", text: "已保存 .config 与 mconfig.h" });
        if (msg.type === "saveBuild") {
          panel?.webview.postMessage({ type: "status", text: "已保存，正在 Build…" });
          const code = await runBuild(true);
          panel?.webview.postMessage({
            type: "status",
            text: code === 0 ? "Save & Build 成功" : `Build 失败 (code ${code})`,
          });
        }
      }
    } catch (err) {
      const text = err instanceof Error ? err.message : String(err);
      panel?.webview.postMessage({ type: "warn", text });
      vscode.window.showErrorMessage(`WS63 Quick Config: ${text}`);
    }
  });

  await refreshPanel();
}
