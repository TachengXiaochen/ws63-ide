# M10 — HostAdapter / BackendClient + 换机加固（0.6.1）

| 项 | 值 |
|----|-----|
| 完成日期 | 2026-07-18 |
| 扩展版本 | **0.6.1** |
| 对应 PLAN | U20 / U21 / U3 可恢复 / 换机零绝对路径 |

## 动机

主路径 Remote-WSL；纯 Windows、路径空格、`cd … && python3 '…'` 字符串拼接是换机翻车源。  
目标：Doctor 可诊断、路径可自清、失败可解释可恢复、执行层无裸 shell 拼串。

## 完成

| 项 | 说明 |
|----|------|
| HostAdapter | `detectHostMode`: remote / wsl-wrap / native；`spawn`/`execFile` 走 argv；`wsl.exe -d Distro -- file args…` |
| BackendClient | CLI / build.py / project / pip / ports / doctor / flash / monitor 全部 argv |
| stream | `runStreamingSpec(SpawnSpec)`；废弃字符串 `runStreaming` 仅作兼容 |
| Terminal | `sendSpecToTerminal` — 仅在终端边界 quote |
| 换机 | `clearStaleConfiguredPaths` + activate 自动迁移；Doctor / Setup 入口 |
| 可恢复 | `diagnose/recover.ts`：Flash/Monitor/Send 失败弹动作（Retry / Stop / Port / Setup…） |
| Doctor | IDE host 模式、stale path、wsl-wrap probe |

## 关键文件

```
extension/src/host/adapter.ts
extension/src/host/backendClient.ts
extension/src/diagnose/recover.ts
extension/src/diagnose/runner.ts
extension/src/executor/stream.ts
extension/src/executor/shell.ts
extension/src/settings.ts          # migratePathsOnActivate
extension/src/commands/*           # 改用 BackendClient
extension/src/confserver/process.ts
```

## 使用（换机）

1. 安装 `ws63-ide-0.6.1.vsix` → Reload  
2. **Remote-WSL** 打开含 `build.py` 的 SDK  
3. 若弹出 stale paths → Clear / Setup  
4. **WS63: Doctor** → 确认 host=Remote、无 FAIL  
5. Select Port → Flash / Monitor  

## 已知限制

- 纯 Windows 宿主无 Remote 时仅 WSL-wrap，且 **禁止 Windows 盘符作 sdkPath**（会明确报错）  
- Terminal 在 wsl-wrap 下仍有一行 `wsl … bash -lc`（交互终端限制）；**进程执行路径已无拼串**  
- `runCaptured(string)` 仍保留但标记 deprecated  

## 下一步

- 删光 deprecated 字符串入口  
- CI 矩阵：Remote-WSL 冒烟  
- 正式 GitHub Release  
