import * as vscode from "vscode";
import { runBuild } from "./build";
import { runCaptured } from "../executor/shell";
import { getSettings, projectCliPath } from "../settings";

let panel: vscode.WebviewPanel | undefined;

interface WizardPatch {
  path: string;
  action: string;
  detail: string;
}

interface WizardResult {
  name: string;
  template: string;
  target: string;
  dry_run: boolean;
  created_files: string[];
  patches: WizardPatch[];
}

const NAME_RE = /^[a-z][a-z0-9_]{2,31}$/;

function shellArg(value: string): string {
  return `'${value.replace(/'/g, `'\\''`)}'`;
}

function parseWizardJson(output: string): WizardResult {
  const start = output.indexOf("{");
  if (start < 0) {
    throw new Error("wizard output missing JSON");
  }
  let depth = 0;
  let end = -1;
  for (let i = start; i < output.length; i++) {
    const ch = output[i];
    if (ch === "{") {
      depth++;
    } else if (ch === "}") {
      depth--;
      if (depth === 0) {
        end = i;
        break;
      }
    }
  }
  if (end < 0) {
    throw new Error("wizard output has incomplete JSON");
  }
  return JSON.parse(output.slice(start, end + 1)) as WizardResult;
}

function validateNameOrThrow(name: string): void {
  if (!NAME_RE.test(name)) {
    throw new Error("项目名须匹配 [a-z][a-z0-9_]{2,31}");
  }
}

function esc(s: string): string {
  return s
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

function renderHtml(target: string, templates: string[]): string {
  const tplOptions = templates
    .map((t) => `<option value="${esc(t)}">${esc(t)}</option>`)
    .join("\n");

  return `<!DOCTYPE html>
<html lang="zh">
<head>
<meta charset="UTF-8">
<meta http-equiv="Content-Security-Policy" content="default-src 'none'; style-src 'unsafe-inline'; script-src 'unsafe-inline';">
<style>
  body { font-family: var(--vscode-font-family); padding: 16px; color: var(--vscode-foreground); background: var(--vscode-editor-background); max-width: 640px; }
  h2 { font-size: 14px; margin: 0 0 4px; }
  .meta { font-size: 11px; color: var(--vscode-descriptionForeground); margin-bottom: 16px; }
  .steps { display: flex; gap: 8px; margin-bottom: 20px; font-size: 11px; }
  .step { padding: 4px 10px; border-radius: 4px; background: var(--vscode-badge-background); color: var(--vscode-badge-foreground); opacity: 0.5; }
  .step.active { opacity: 1; outline: 1px solid var(--vscode-focusBorder); }
  .panel { display: none; }
  .panel.active { display: block; }
  label { display: block; font-size: 12px; margin: 12px 0 4px; }
  input, select { width: 100%; box-sizing: border-box; padding: 6px 8px; font-size: 13px;
    background: var(--vscode-input-background); color: var(--vscode-input-foreground);
    border: 1px solid var(--vscode-input-border, transparent); border-radius: 4px; }
  .hint { font-size: 11px; color: var(--vscode-descriptionForeground); margin-top: 4px; }
  pre { font-size: 11px; background: var(--vscode-textCodeBlock-background); padding: 10px; border-radius: 4px;
    overflow: auto; max-height: 280px; white-space: pre-wrap; word-break: break-all; }
  .actions { margin-top: 20px; display: flex; gap: 8px; flex-wrap: wrap; }
  button { padding: 6px 14px; cursor: pointer; border: none; border-radius: 4px; font-size: 12px; }
  .primary { background: var(--vscode-button-background); color: var(--vscode-button-foreground); }
  .secondary { background: var(--vscode-button-secondaryBackground); color: var(--vscode-button-secondaryForeground); }
  .msg { margin-top: 12px; font-size: 11px; color: var(--vscode-descriptionForeground); min-height: 16px; }
  .warn { color: var(--vscode-editorWarning-foreground, #cca700); }
  .err { color: var(--vscode-errorForeground, #f14c4c); }
  ul.files { font-size: 11px; padding-left: 18px; margin: 8px 0; }
</style>
</head>
<body>
  <h2>WS63 New Application</h2>
  <div class="meta">SDK 内注册 standalone 应用 · Target: ${esc(target)}</div>
  <div class="steps">
    <span class="step active" data-step="1">1 名称</span>
    <span class="step" data-step="2">2 模板</span>
    <span class="step" data-step="3">3 预览</span>
    <span class="step" data-step="4">4 生成</span>
  </div>

  <div class="panel active" id="p1">
    <label for="name">项目名</label>
    <input id="name" placeholder="my_app" autocomplete="off" />
    <div class="hint">小写字母开头，[a-z0-9_]，3–32 字符</div>
    <label for="title">显示标题（可选）</label>
    <input id="title" placeholder="My App" autocomplete="off" />
  </div>

  <div class="panel" id="p2">
    <label for="template">模板</label>
    <select id="template">${tplOptions}</select>
    <div class="hint">standalone：application/&lt;name&gt;/ + SDK 四处注册</div>
    <label for="target">Build target</label>
    <input id="target" value="${esc(target)}" readonly />
  </div>

  <div class="panel" id="p3">
    <div class="hint">以下变更尚未写入磁盘（dry-run）</div>
    <ul class="files" id="file-list"></ul>
    <pre id="preview-json">点击「刷新预览」加载…</pre>
  </div>

  <div class="panel" id="p4">
    <p style="font-size:13px;">将创建应用、注册 SDK，并启用 Kconfig（<code>*_ENABLE=y</code>）。</p>
    <label><input type="checkbox" id="build-after" checked /> 生成后 Save &amp; Build</label>
  </div>

  <div class="actions">
    <button class="secondary" id="btn-back" disabled>上一步</button>
    <button class="primary" id="btn-next">下一步</button>
    <button class="secondary" id="btn-preview" style="display:none">刷新预览</button>
    <button class="primary" id="btn-create" style="display:none">生成项目</button>
  </div>
  <div class="msg" id="msg"></div>

  <script>
    const vscode = acquireVsCodeApi();
    let step = 1;
    const maxStep = 4;

    function showStep(n) {
      step = n;
      document.querySelectorAll('.panel').forEach((el, i) => el.classList.toggle('active', i + 1 === n));
      document.querySelectorAll('.step').forEach(el => el.classList.toggle('active', +el.dataset.step === n));
      document.getElementById('btn-back').disabled = n <= 1;
      document.getElementById('btn-next').style.display = n < maxStep ? '' : 'none';
      document.getElementById('btn-preview').style.display = n === 3 ? '' : 'none';
      document.getElementById('btn-create').style.display = n === maxStep ? '' : 'none';
      if (n === 3) vscode.postMessage({ type: 'preview', ...collect() });
    }

    function collect() {
      return {
        name: document.getElementById('name').value.trim(),
        title: document.getElementById('title').value.trim(),
        template: document.getElementById('template').value,
        target: document.getElementById('target').value.trim(),
        buildAfter: document.getElementById('build-after').checked,
      };
    }

    document.getElementById('btn-next').onclick = () => {
      const d = collect();
      if (step === 1) {
        if (!d.name) { document.getElementById('msg').innerHTML = '<span class="err">请输入项目名</span>'; return; }
        vscode.postMessage({ type: 'validateName', name: d.name });
        return;
      }
      if (step < maxStep) showStep(step + 1);
    };
    document.getElementById('btn-back').onclick = () => showStep(step - 1);
    document.getElementById('btn-preview').onclick = () => vscode.postMessage({ type: 'preview', ...collect() });
    document.getElementById('btn-create').onclick = () => vscode.postMessage({ type: 'create', ...collect() });

    window.addEventListener('message', e => {
      const m = e.data;
      if (m.type === 'status') document.getElementById('msg').textContent = m.text || '';
      if (m.type === 'warn') document.getElementById('msg').innerHTML = '<span class="warn">' + m.text + '</span>';
      if (m.type === 'error') document.getElementById('msg').innerHTML = '<span class="err">' + m.text + '</span>';
      if (m.type === 'nameOk') showStep(2);
      if (m.type === 'previewData') {
        document.getElementById('preview-json').textContent = m.json || '';
        const ul = document.getElementById('file-list');
        ul.innerHTML = (m.files || []).map(f => '<li>' + f + '</li>').join('');
      }
    });
  </script>
</body>
</html>`;
}

async function listTemplates(): Promise<string[]> {
  const s = getSettings();
  const r = await runCaptured(`python3 ${projectCliPath(s)} list-templates`);
  if (r.code !== 0) {
    throw new Error(r.stderr || r.stdout || "list-templates failed");
  }
  return r.stdout
    .split("\n")
    .map((l) => l.trim())
    .filter(Boolean);
}

async function runDryRun(name: string, template: string, target: string, title?: string): Promise<WizardResult> {
  validateNameOrThrow(name);
  const s = getSettings();
  const titleArg = title ? ` --title ${shellArg(title)}` : "";
  const cmd = `python3 ${projectCliPath(s)} create ${shellArg(name)} --template ${shellArg(template)} --target ${shellArg(target)}${titleArg} --dry-run`;
  const r = await runCaptured(cmd);
  if (r.code !== 0) {
    throw new Error(r.stderr || r.stdout || "dry-run failed");
  }
  return parseWizardJson(r.stdout);
}

async function runCreate(
  name: string,
  template: string,
  target: string,
  title?: string
): Promise<WizardResult> {
  validateNameOrThrow(name);
  const s = getSettings();
  const titleArg = title ? ` --title ${shellArg(title)}` : "";
  const cmd = `python3 ${projectCliPath(s)} create ${shellArg(name)} --template ${shellArg(template)} --target ${shellArg(target)}${titleArg} --enable-config`;
  const r = await runCaptured(cmd);
  const combined = r.stdout + r.stderr;
  if (r.code !== 0 && !combined.includes('"created_files"')) {
    throw new Error(r.stderr || r.stdout || "create failed");
  }
  return parseWizardJson(r.stdout || combined);
}

function formatPreview(result: WizardResult): string {
  const lines = ["=== 新建文件 ===", ...result.created_files, "", "=== SDK Patches ==="];
  for (const p of result.patches) {
    lines.push(`[${p.action}] ${p.path}`);
    lines.push(`  ${p.detail}`);
  }
  return lines.join("\n");
}

export async function runNewProject(): Promise<void> {
  const s = getSettings();
  let templates: string[] = ["standalone"];
  try {
    templates = await listTemplates();
  } catch (err) {
    const text = err instanceof Error ? err.message : String(err);
    vscode.window.showWarningMessage(`WS63: 无法列出模板，使用 standalone。${text}`);
  }

  if (panel) {
    panel.reveal(vscode.ViewColumn.Beside);
    return;
  }

  panel = vscode.window.createWebviewPanel(
    "ws63NewProject",
    "WS63 New Application",
    vscode.ViewColumn.Beside,
    { enableScripts: true, retainContextWhenHidden: true }
  );

  panel.onDidDispose(() => {
    panel = undefined;
  });

  panel.webview.onDidReceiveMessage(async (msg) => {
    try {
      if (msg.type === "validateName") {
        const name = String(msg.name || "");
        if (!/^[a-z][a-z0-9_]{2,31}$/.test(name)) {
          panel?.webview.postMessage({
            type: "error",
            text: "项目名须匹配 [a-z][a-z0-9_]{2,31}",
          });
          return;
        }
        panel?.webview.postMessage({ type: "nameOk" });
        return;
      }

      if (msg.type === "preview") {
        const name = String(msg.name || "").trim();
        const template = String(msg.template || "standalone");
        const target = String(msg.target || s.target);
        const title = msg.title ? String(msg.title).trim() : undefined;
        if (!name) {
          panel?.webview.postMessage({ type: "error", text: "请先在步骤 1 填写项目名" });
          return;
        }
        panel?.webview.postMessage({ type: "status", text: "正在 dry-run…" });
        const result = await runDryRun(name, template, target, title || undefined);
        panel?.webview.postMessage({
          type: "previewData",
          json: formatPreview(result),
          files: result.created_files,
        });
        panel?.webview.postMessage({ type: "status", text: "预览已更新（未写入磁盘）" });
        return;
      }

      if (msg.type === "create") {
        const name = String(msg.name || "").trim();
        const template = String(msg.template || "standalone");
        const target = String(msg.target || s.target);
        const title = msg.title ? String(msg.title).trim() : undefined;
        const buildAfter = !!msg.buildAfter;

        if (!name) {
          panel?.webview.postMessage({ type: "error", text: "请先在步骤 1 填写项目名" });
          return;
        }

        panel?.webview.postMessage({ type: "status", text: "正在生成…" });
        const result = await runCreate(name, template, target, title || undefined);
        panel?.webview.postMessage({
          type: "status",
          text: `已创建 ${result.name}（${result.patches.length} 处 patch）`,
        });
        vscode.window.showInformationMessage(`WS63: 应用 ${name} 已创建并启用 Kconfig`);

        if (buildAfter) {
          panel?.webview.postMessage({ type: "status", text: "正在 Build…" });
          const code = await runBuild(true);
          panel?.webview.postMessage({
            type: code === 0 ? "status" : "warn",
            text: code === 0 ? "生成并 Build 成功" : `Build 失败 (code ${code})`,
          });
        }
      }
    } catch (err) {
      const text = err instanceof Error ? err.message : String(err);
      panel?.webview.postMessage({ type: "error", text });
      vscode.window.showErrorMessage(`WS63 New Project: ${text}`);
    }
  });

  panel.webview.html = renderHtml(s.target, templates);
}
