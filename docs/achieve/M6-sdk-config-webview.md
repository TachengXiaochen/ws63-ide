# M6 — SDK Configuration Editor Webview（扩展 0.4.0）

| 项 | 值 |
|----|-----|
| 完成日期 | 2026-07-10 |
| 里程碑 | Phase 3 — M6 |
| VSIX | `tools/ws63-ide/extension/ws63-ide-0.4.0.vsix` |

## 完成内容

### 后端（M5）

- `confserver.py` + `menu_exporter.py` + `export-menus` / `confserver` CLI

### 扩展新增

| 文件 | 作用 |
|------|------|
| `confserver/process.ts` | 子进程 stdin/stdout JSON 通信 |
| `commands/sdkConfig.ts` | SDK Configuration Webview |
| `sidebar` | **SDK Configuration** 入口 |
| `statusBar` | **SDK Config** 按钮 |
| `package.json` | `ws63.sdkConfig`，版本 **0.4.0** |

### Webview 功能

- 完整 Kconfig 树（Application / Drivers / Kernel / …）
- 搜索 symbol 名 / 标题
- bool：checkbox；int/string/hex：详情面板编辑
- 依赖 hide/show（confserver `visible` 增量更新）
- Revert / Reload / Save / Save & Build (Clean)

## 使用

1. 安装 `ws63-ide-0.4.0.vsix`
2. 侧边栏 → **SDK Configuration**（或状态栏 **SDK Config**）
3. 展开 **Application**，修改 sle_tp 等项 → **Save**

## CLI 调试（Agent）

```bash
CLI=tools/ws63-ide/backend/ws63_cli.py
python3 $CLI export-menus --target ws63-liteos-app
python3 $CLI confserver --request '{"version":3,"set":{"SLE_TP_APP_CLIENT":false}}'
```

## 已知限制（M7 待办）

- choice / tristate 控件较简
- 超大菜单树首次渲染略慢（~200KB JSON）
- 与 terminal menuconfig 并发写可能冲突（Save 前勿同时开 ncurses）

## 下一步（M7 / M8）

- choice 下拉、虚拟滚动优化
- Quick Config 增加「Open Full SDK Config」
- 文档更新 README Agent 示例
