import * as vscode from "vscode";
import * as fs from "fs";
import { runBuild } from "./build";
import { ConfserverProcess, disposeConfserver, getConfserver } from "../confserver/process";
import { getSettings } from "../settings";
import { backendClient } from "../host/backendClient";

interface MenuNode {
  id: string;
  kind: "menu" | "config" | "choice";
  type?: string;
  title: string;
  help?: string;
  members?: string[];
  children?: MenuNode[];
}

interface MenusFile {
  menus: MenuNode[];
  target: string;
}

let panel: vscode.WebviewPanel | undefined;
let server: ConfserverProcess | undefined;
let menusData: MenusFile | undefined;

function esc(s: string): string {
  return s
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

function renderHtml(target: string): string {
  return `<!DOCTYPE html>
<html lang="zh">
<head>
<meta charset="UTF-8">
<meta http-equiv="Content-Security-Policy" content="default-src 'none'; style-src 'unsafe-inline'; script-src 'unsafe-inline';">
<style>
  body { font-family: var(--vscode-font-family); margin:0; padding:0; color: var(--vscode-foreground); background: var(--vscode-editor-background); height:100vh; display:flex; flex-direction:column; }
  header { padding:10px 14px; border-bottom:1px solid var(--vscode-panel-border); display:flex; gap:10px; align-items:center; flex-wrap:wrap; }
  header h2 { margin:0; font-size:14px; flex:1; }
  .meta { font-size:11px; color: var(--vscode-descriptionForeground); }
  #search { flex:1; min-width:180px; padding:6px 8px; background:var(--vscode-input-background); color:var(--vscode-input-foreground); border:1px solid var(--vscode-input-border,transparent); border-radius:4px; }
  main { flex:1; display:flex; min-height:0; }
  #tree { width:42%; border-right:1px solid var(--vscode-panel-border); overflow:auto; padding:8px 0; font-size:12px; }
  #detail { flex:1; overflow:auto; padding:14px; font-size:13px; }
  .menu > .label { font-weight:600; padding:6px 12px; cursor:pointer; user-select:none; }
  .menu > .label::before { content:'▸ '; color:var(--vscode-descriptionForeground); }
  .menu.open > .label::before { content:'▾ '; }
  .menu-children { display:none; padding-left:10px; }
  .menu.open > .menu-children { display:block; }
  .cfg-group { margin: 2px 0; }
  .cfg-children { padding-left: 22px; margin-left: 10px; border-left: 1px solid var(--vscode-panel-border); }
  .cfg { padding:3px 12px 3px 20px; display:flex; gap:8px; align-items:flex-start; cursor:pointer; }
  .cfg:hover { background: var(--vscode-list-hoverBackground); }
  .cfg.hidden { display:none; }
  .cfg.selected { background: var(--vscode-list-activeSelectionBackground); color: var(--vscode-list-activeSelectionForeground); }
  .cfg-title { flex:1; line-height:18px; }
  .cfg-id { font-size:10px; color:var(--vscode-descriptionForeground); }
  footer { padding:10px 14px; border-top:1px solid var(--vscode-panel-border); display:flex; gap:8px; align-items:center; flex-wrap:wrap; }
  button { padding:6px 14px; cursor:pointer; border:none; border-radius:4px; font-size:12px; background:var(--vscode-button-background); color:var(--vscode-button-foreground); }
  button.secondary { background:var(--vscode-button-secondaryBackground); color:var(--vscode-button-secondaryForeground); }
  .msg { font-size:11px; color:var(--vscode-descriptionForeground); flex:1; }
  .warn { color: var(--vscode-editorWarning-foreground, #cca700); }
  .err { color: var(--vscode-errorForeground, #f14c4c); }
  #help { white-space:pre-wrap; font-size:12px; color:var(--vscode-descriptionForeground); margin-top:12px; line-height:1.5; }
  .cfg.dirty .cfg-title { font-weight:600; color: var(--vscode-charts-orange, #e2a03f); }
  .choice-radios label { display:block; margin:6px 0; cursor:pointer; }
  input[type=text], input[type=number], select { padding:4px 8px; background:var(--vscode-input-background); color:var(--vscode-input-foreground); border:1px solid var(--vscode-input-border,transparent); border-radius:4px; }
</style>
</head>
<body>
<header>
  <h2>WS63 SDK Configuration</h2>
  <span class="meta">Target: ${esc(target)}</span>
  <input id="search" placeholder="Search symbol or title…" />
</header>
<main>
  <div id="tree"></div>
  <div id="detail"><p class="meta">Select a config item on the left.</p></div>
</main>
<footer>
  <span class="msg" id="msg"></span>
  <button class="secondary" id="btn-revert">Revert</button>
  <button class="secondary" id="btn-reload">Reload</button>
  <button id="btn-save">Save</button>
  <button id="btn-save-build">Save &amp; Build</button>
</footer>
<script>
  const vscode = acquireVsCodeApi();
  let menus = [];
  let values = {};
  let visible = {};
  let ranges = {};
  let selectedId = null;
  let dirty = false;

  function isVisible(id) {
    return visible[id] !== false;
  }

  function matchSearch(node, q) {
    if (!q) return true;
    q = q.toLowerCase();
    if (node.id && node.id.toLowerCase().includes(q)) return true;
    if (node.title && node.title.toLowerCase().includes(q)) return true;
    return false;
  }

  function nodeMatchesTree(node, q) {
    if (!q) return true;
    if (matchSearch(node, q)) return true;
    return (node.children || []).some(c => nodeMatchesTree(c, q));
  }

  function selectedChoiceMember(n) {
    const members = n.members || [];
    for (const m of members) {
      if (values[m] === true || values[m] === 'y') return m;
    }
    return members[0] || '';
  }

  function renderCfgRow(n) {
    const val = values[n.id];
    const checked = val === true || val === 'y';
    let control = '';
    let dirtyClass = '';
    if (n.kind === 'choice' || n.type === 'choice') {
      const sel = selectedChoiceMember(n);
      control = '<span class="cfg-id">' + escHtml(sel || '—') + '</span>';
    } else if (n.type === 'bool' || n.type === 'tristate') {
      control = '<input type="checkbox" data-id="' + escHtml(n.id) + '" ' + (checked ? 'checked' : '') + ' />';
    } else {
      control = '<span class="cfg-id">' + escHtml(String(val ?? '')) + '</span>';
    }
    return '<div class="cfg' + (selectedId === n.id ? ' selected' : '') + dirtyClass + '" data-select="' + escHtml(n.id) + '">' +
      control + '<span class="cfg-title">' + escHtml(n.title) + '</span></div>';
  }

  function renderTreeNodes(nodes, q) {
    let html = '';
    for (const n of nodes || []) {
      if (n.kind === 'menu') {
        const childHtml = renderTreeNodes(n.children || [], q);
        if (!childHtml && q) continue;
        html += '<div class="menu open"><div class="label">' + escHtml(n.title) + '</div><div class="menu-children">' + childHtml + '</div></div>';
      } else if (n.kind === 'choice' || n.type === 'choice') {
        if (q && !nodeMatchesTree(n, q)) continue;
        html += '<div class="cfg-group">' + renderCfgRow(n);
        const childHtml = renderTreeNodes(n.children || [], q);
        if (childHtml) html += '<div class="cfg-children">' + childHtml + '</div>';
        html += '</div>';
      } else if (n.kind === 'config') {
        const childHtml = (n.children && n.children.length) ? renderTreeNodes(n.children, q) : '';
        const selfVisible = isVisible(n.id);
        if (!selfVisible && !childHtml) continue;
        if (q && !nodeMatchesTree(n, q)) continue;
        if (selfVisible) {
          html += '<div class="cfg-group">' + renderCfgRow(n);
          if (childHtml) html += '<div class="cfg-children">' + childHtml + '</div>';
          html += '</div>';
        } else if (childHtml) {
          html += childHtml;
        }
      }
    }
    return html;
  }

  function escHtml(s) {
    return String(s).replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;').replace(/"/g,'&quot;');
  }

  function render() {
    const q = document.getElementById('search').value.trim();
    document.getElementById('tree').innerHTML = renderTreeNodes(menus, q);
    bindTreeEvents();
    renderDetail();
  }

  function bindTreeEvents() {
    document.querySelectorAll('.menu > .label').forEach(el => {
      el.onclick = () => el.parentElement.classList.toggle('open');
    });
    document.querySelectorAll('input[data-id]').forEach(el => {
      el.onchange = () => {
        const id = el.getAttribute('data-id');
        values[id] = el.checked;
        dirty = true;
        vscode.postMessage({ type: 'set', id, value: el.checked });
      };
    });
    document.querySelectorAll('[data-select]').forEach(el => {
      el.onclick = (e) => {
        if (e.target.tagName === 'INPUT') return;
        selectedId = el.getAttribute('data-select');
        renderDetail();
        document.querySelectorAll('.cfg.selected').forEach(x => x.classList.remove('selected'));
        el.classList.add('selected');
      };
    });
  }

  function findNode(nodes, id) {
    for (const n of nodes || []) {
      if (n.id === id) return n;
      const c = findNode(n.children, id);
      if (c) return c;
    }
    return null;
  }

  function renderDetail() {
    const box = document.getElementById('detail');
    if (!selectedId) { box.innerHTML = '<p class="meta">Select a config item on the left.</p>'; return; }
    const n = findNode(menus, selectedId);
    if (!n) return;
    const val = values[selectedId];
    let editor = '';
    if (n.kind === 'choice' || n.type === 'choice') {
      const sel = selectedChoiceMember(n);
      editor = '<div class="choice-radios">';
      for (const m of (n.members || [])) {
        editor += '<label><input type="radio" name="choice-' + escHtml(n.id) + '" data-member="' + escHtml(m) + '" ' +
          (m === sel ? 'checked' : '') + ' /> ' + escHtml(m) + '</label>';
      }
      editor += '</div>';
    } else if (n.type === 'bool' || n.type === 'tristate') {
      editor = '<label><input type="checkbox" id="detail-bool" ' + (val === true || val === 'y' ? 'checked' : '') + ' /> Enabled</label>';
    } else if (n.type === 'int' || n.type === 'hex') {
      editor = '<input type="number" id="detail-num" value="' + escHtml(String(val ?? 0)) + '" />';
    } else if (n.type === 'string') {
      editor = '<input type="text" id="detail-str" value="' + escHtml(String(val ?? '')) + '" style="width:100%" />';
    } else {
      editor = '<code>' + escHtml(String(val ?? '')) + '</code>';
    }
    box.innerHTML = '<h3 style="margin:0 0 6px;font-size:14px;">' + escHtml(n.title) + '</h3>' +
      '<div class="cfg-id">' + escHtml(n.id) + ' · ' + escHtml(n.type || n.kind || '') + '</div>' +
      '<div style="margin-top:12px">' + editor + '</div>' +
      '<div id="help">' + escHtml(n.help || '') + '</div>' +
      (dirty ? '<p class="warn" style="margin-top:8px">Unsaved changes</p>' : '');
    const db = document.getElementById('detail-bool');
    if (db) db.onchange = () => { values[selectedId]=db.checked; dirty=true; vscode.postMessage({ type:'set', id:selectedId, value:db.checked }); render(); };
    const dn = document.getElementById('detail-num');
    if (dn) dn.onchange = () => { values[selectedId]=Number(dn.value); dirty=true; vscode.postMessage({ type:'set', id:selectedId, value:Number(dn.value) }); };
    const ds = document.getElementById('detail-str');
    if (ds) ds.onchange = () => { values[selectedId]=ds.value; dirty=true; vscode.postMessage({ type:'set', id:selectedId, value:ds.value }); };
    box.querySelectorAll('input[data-member]').forEach(el => {
      el.onchange = () => {
        if (!el.checked) return;
        const member = el.getAttribute('data-member');
        dirty = true;
        vscode.postMessage({ type: 'set', id: member, value: true });
        values[member] = true;
        for (const m of (n.members || [])) {
          if (m !== member) values[m] = false;
        }
        render();
      };
    });
  }

  document.getElementById('search').oninput = () => render();
  document.getElementById('btn-save').onclick = () => vscode.postMessage({ type: 'save' });
  document.getElementById('btn-save-build').onclick = () => vscode.postMessage({ type: 'saveBuild' });
  document.getElementById('btn-revert').onclick = () => vscode.postMessage({ type: 'revert' });
  document.getElementById('btn-reload').onclick = () => vscode.postMessage({ type: 'reload' });

  window.addEventListener('message', e => {
    const m = e.data;
    if (m.type === 'init') {
      menus = m.menus || []; values = m.values || {}; visible = m.visible || {}; ranges = m.ranges || {};
      dirty = false; render();
      document.getElementById('msg').textContent = 'Loaded ' + Object.keys(values).length + ' symbols';
    }
    if (m.type === 'patch') {
      if (m.values) Object.assign(values, m.values);
      if (m.visible) Object.assign(visible, m.visible);
      render();
    }
    if (m.type === 'status') document.getElementById('msg').textContent = m.text || '';
    if (m.type === 'warn') document.getElementById('msg').innerHTML = '<span class="warn">' + escHtml(m.text) + '</span>';
    if (m.type === 'error') document.getElementById('msg').innerHTML = '<span class="err">' + escHtml(m.text) + '</span>';
    if (m.type === 'restarted') {
      document.getElementById('msg').innerHTML = '<span class="warn">Confserver restarted — retry your change if needed</span>';
    }
  });
</script>
</body>
</html>`;
}

async function exportMenusPath(): Promise<string> {
  const r = await backendClient.exportMenus();
  if (r.code !== 0) {
    throw new Error(r.stderr || r.stdout || "export-menus failed");
  }
  return r.stdout.trim().split("\n").pop()!;
}

async function loadMenus(path: string): Promise<MenusFile> {
  const raw = await fs.promises.readFile(path, "utf8");
  return JSON.parse(raw) as MenusFile;
}

async function ensureServer(): Promise<ConfserverProcess> {
  if (!server) {
    server = getConfserver();
  }
  if (!server.alive) {
    await server.start();
  }
  return server;
}

async function pushState(webview: vscode.Webview): Promise<void> {
  const st = server?.currentState;
  if (!st || !menusData) {
    return;
  }
  webview.postMessage({
    type: "init",
    menus: menusData.menus,
    values: st.values,
    visible: st.visible,
    ranges: st.ranges || {},
  });
}

export async function runSdkConfig(): Promise<void> {
  const s = getSettings();

  if (panel) {
    panel.reveal(vscode.ViewColumn.Beside);
    await pushState(panel.webview);
    return;
  }

  panel = vscode.window.createWebviewPanel(
    "ws63SdkConfig",
    "WS63 SDK Configuration",
    vscode.ViewColumn.Beside,
    { enableScripts: true, retainContextWhenHidden: true }
  );

  panel.webview.html = renderHtml(s.target);
  panel.webview.postMessage({ type: "status", text: "Exporting menu tree…" });

  try {
    const menusPath = await exportMenusPath();
    menusData = await loadMenus(menusPath);
    panel.webview.postMessage({ type: "status", text: "Starting confserver…" });
    await ensureServer();
    await pushState(panel.webview);
  } catch (err) {
    const text = err instanceof Error ? err.message : String(err);
    panel.webview.postMessage({ type: "error", text });
    vscode.window.showErrorMessage(`WS63 SDK Config: ${text}`);
  }

  panel.onDidDispose(() => {
    panel = undefined;
    disposeConfserver();
    server = undefined;
  });

  panel.webview.onDidReceiveMessage(async (msg) => {
    if (!panel) {
      return;
    }
    try {
      if (msg.type === "set") {
        const srv = await ensureServer();
        let resp;
        try {
          resp = await srv.request({ set: { [msg.id]: msg.value } });
        } catch (err) {
          panel.webview.postMessage({ type: "restarted" });
          resp = await (await ensureServer()).request({ set: { [msg.id]: msg.value } });
        }
        if (resp.error?.length) {
          panel.webview.postMessage({ type: "warn", text: resp.error.join("; ") });
        }
        panel.webview.postMessage({
          type: "patch",
          values: resp.values,
          visible: resp.visible,
        });
        return;
      }
      if (msg.type === "revert" || msg.type === "reload") {
        disposeConfserver();
        server = undefined;
        await ensureServer();
        await pushState(panel.webview);
        panel.webview.postMessage({
          type: "status",
          text: msg.type === "revert" ? "已恢复磁盘配置" : "已重新加载",
        });
        return;
      }
      if (msg.type === "save" || msg.type === "saveBuild") {
        const srv = await ensureServer();
        const resp = await srv.request({ save: null });
        if (resp.error?.length) {
          panel.webview.postMessage({ type: "error", text: resp.error.join("; ") });
          return;
        }
        panel.webview.postMessage({ type: "status", text: "已保存 .config 与 mconfig.h" });
        if (msg.type === "saveBuild") {
          panel.webview.postMessage({ type: "status", text: "正在 Build (Clean)…" });
          const code = await runBuild(true);
          panel.webview.postMessage({
            type: code === 0 ? "status" : "error",
            text: code === 0 ? "Save & Build 成功" : `Build 失败 (code ${code})`,
          });
        }
      }
    } catch (err) {
      const text = err instanceof Error ? err.message : String(err);
      panel.webview.postMessage({ type: "error", text });
    }
  });
}
