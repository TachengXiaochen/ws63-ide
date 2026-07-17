# M2 — Quick Config Webview（扩展 0.2.0）

| 项 | 值 |
|----|-----|
| 完成日期 | 2026-07-10 |
| 里程碑 | Phase 2 — M2 |
| VSIX | `tools/ws63-ide/extension/ws63-ide-0.2.0.vsix` |

## 完成内容

### 后端（沿用 M1）

- `getconfig` / `setconfig` / `saveconfig` 子命令

### 扩展新增

| 文件 | 作用 |
|------|------|
| `providers/fileConfigProvider.ts` | 通过 CLI 读写 sle_tp 三项 |
| `commands/quickConfig.ts` | Quick Config Webview 面板 |
| `sidebar` | 新增 **Quick Config (SLE)** 入口 |
| `package.json` | 命令 `ws63.quickConfig`，版本 **0.2.0** |

### Webview 功能

- ☑ SLE_TP_APP_ENABLE / SERVER / CLIENT
- **Revert** — 重新 getconfig
- **Save** — setconfig + saveconfig
- **Save & Build** — 保存后触发 clean build
- **Terminal menuconfig** — 打开完整 ncurses 配置
- Server+Client 同时启用时显示警告

## 测试记录

### CLI 回归（M1）

```bash
python3 ws63_cli.py getconfig
python3 ws63_cli.py setconfig SLE_TP_APP_CLIENT=n --save
```

通过。

### 扩展编译

```bash
cd tools/ws63-ide/extension && npm run compile && npm run package
```

产出 `ws63-ide-0.2.0.vsix`，无 TypeScript 错误。

### 端到端（需用户侧）

1. 安装 `ws63-ide-0.2.0.vsix`
2. 侧边栏 → **Quick Config (SLE)**
3. 勾选/取消 → Save → 终端 `./build.py ws63-liteos-app` 验证

## 下一步（M3）

- `ws63_project.py` + standalone 模板 + patcher
