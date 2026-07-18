# M8 / M9 — P0 产品体验收口（扩展 0.6.0）

| 项 | 值 |
|----|-----|
| 完成日期 | 2026-07-18 |
| 里程碑 | PLAN P0：U1 / U2 / U3 / U4 / U5 / U25 |
| 扩展版本 | **0.6.0** |
| 仓库 | https://github.com/TachengXiaochen/ws63-ide |

## 背景

在 0.5.2（Doctor / Flash·Monitor 加固）之上，按 `docs/PLAN.md` v0.3 执行 P0：

- Monitor **保持 Terminal**（不做独立面板）
- 新增 **多串口 Monitor / 多固件 Flash**
- 补齐 Config M8、日志颜色、Target QuickPick、CI / Problem Matcher

## 完成对照

| ID | 项 | 实现要点 |
|----|----|----------|
| **U25** | 批量 Monitor / Flash | `ws63.monitorMulti`：每口一个 `WS63 Monitor (PORT)` 终端；`ws63.flashMulti`：交互选口 / `ws63.flashJobs` 预设；顺序或并行；`stream.ts` 支持多进程 |
| **U2** | Terminal Monitor 体验 | `portio/colors.py`：去掉 `\033[90m`，`[TAG]` 用亮白；SLE_LENET / AI / RESULT 高亮；Stop 可结束 Monitor/Debug |
| **U3** | Flash 可靠性 | `ws63.flashRetries`；失败分类后可重试；`runFlashJob(port, fw)` 复用 |
| **U1** | SDK Config M8 | choice 节点导出 + 详情区 radio；confserver `request` 崩溃自动 restart；menuconfig 冲突提示 |
| **U4** | 多 target | `ws63.selectTarget`；状态栏 Target 可点；可选同步 `firmwareRel` |
| **U5** | 发布收尾 | `repository`→真实 GitHub；`CHANGELOG.md`；`.github/workflows/ci.yml`；Build→Problems（`diagnostics.ts` + `ws63-gcc` matcher） |

## 关键代码

| 区域 | 文件 |
|------|------|
| 颜色 | `backend/portio/colors.py` |
| 端口锁 | `extension/src/diagnose/portLock.ts`（per-port） |
| Monitor | `commands/monitor.ts`（+ Multi） |
| Flash | `commands/flash.ts`、`flashMulti.ts` |
| Stop | `commands/stop.ts` |
| Config | `kconfig/menu_exporter.py`、`confserver/process.ts`、`commands/sdkConfig.ts` |
| Target | `commands/settings.ts` → `selectTarget` |
| Build | `output/diagnostics.ts`、`commands/build.ts` |
| 元数据 | `extension/package.json` 0.6.0、`CHANGELOG.md`、`.github/workflows/ci.yml` |

## 使用

```text
命令面板：
  WS63: Multi Monitor   — 勾选多个串口，各开 Terminal
  WS63: Multi Flash     — 多口烧录（可预设 ws63.flashJobs）
  WS63: Select Target   — 或点状态栏 Target
  WS63: Stop            — 停 Build/Flash + 所有 Monitor/Debug
```

`settings.json` 示例：

```json
{
  "ws63.flashRetries": 1,
  "ws63.flashJobs": [
    { "port": "COM19", "firmwareRel": "output/ws63/fwpkg/ws63-liteos-app/ws63-liteos-app_all.fwpkg", "label": "board-A" },
    { "port": "COM20", "firmwareRel": "output/ws63/fwpkg/ws63-liteos-app/ws63-liteos-app_all.fwpkg", "label": "board-B" }
  ]
}
```

发版：

```bash
cd tools/ws63-ide/extension
npm run compile && npm run package
# → ws63-ide-0.6.0.vsix
```

## 已知限制 / 未做

| 项 | 说明 |
|----|------|
| 虚拟滚动 | 超大 Kconfig 树仍可能卡顿（M8 性能项未做完） |
| Monitor 过滤 / 时间戳 / 自动重连 | 未做 CLI 开关；颜色与多实例优先 |
| 真·GitHub Release | CI 打出 artifact，需手动创建 Release |
| 多根工作区选 SDK | 仍靠自动探测 / Settings，无专用 QuickPick |
| 并行 Flash UI | 多路共用一个 ProgressPanel，进度可能交错 |

## 下一步（P1 / PLAN）

- 示例导入、多 profile、快捷键、i18n  
- Marketplace / 版本矩阵  
- HostAdapter / BackendClient 架构债  

详见更新后的 [`docs/PLAN.md`](../PLAN.md)。
