# WS63 IDE — 总体计划与未完成清单

> **定位**：Cursor / VS Code 扩展 + Python CLI，对标 ESP-IDF Extension 的 Build / Flash / Monitor / SDK Config 工作流。  
> **当前基线**：扩展 **0.6.1**（2026-07-18）  
> **公开仓库**：[https://github.com/TachengXiaochen/ws63-ide](https://github.com/TachengXiaochen/ws63-ide)（MIT）  
> **文档角色**：本文是**现状 + 产品决策 + 未完成项 + 后续路线**的活文档。

| 项 | 值 |
|----|-----|
| 文档版本 | 0.5 |
| 更新日期 | 2026-07-18 |
| SDK 根 | 含 `build.py` 的工作区（通常 `fbb_ws63/src`） |
| 工具根 | `tools/ws63-ide/` |
| 默认 target | `ws63-liteos-app` |
| **主环境** | **Remote-WSL**（纯 Windows 宿主非主路径） |

---

## 1. 一句话现状

**P0（0.6.0）+ HostAdapter/换机/可恢复（0.6.1）已落地。**  
业务子进程走 **argv**（不再 `cd … && python3 '…'`）；换机可清 stale 路径；Flash/Monitor 失败可点 Retry/Stop/Port/Doctor。

```
已完成                                      未完成
─────────────────────────────────────       ──────────────────────────
工作流 + Multi Flash/Monitor + Config       示例库 / profile / 快捷键
Doctor / Setup / Clear stale paths          Monitor 过滤·时间戳·重连
★ HostAdapter + BackendClient               删 deprecated 字符串兼容层
★ Flash/Monitor offerRecovery               GitHub Release / 版本矩阵
CI + Problems + CHANGELOG                   跨平台矩阵测试
```

---

## 2. 产品决策

| 决策 | 说明 |
|------|------|
| Monitor = Terminal | 不做独立面板（便于投喂 Cursor） |
| 批量多设备 | Multi Monitor / Multi Flash（0.6.0） |
| **argv only** | HostAdapter + BackendClient（0.6.1） |
| **换机** | migratePathsOnActivate + Doctor Clear stale |
| 主路径 | Remote-WSL；Windows 盘符作 sdkPath 直接报错 |

---

## 3. 已完成

| 里程碑 | 版本 | 状态 |
|--------|------|------|
| Phase 1–3 MVP / M7 | ≤0.5.2 | ✅ |
| P0 M8–M9（批量/颜色/choice/CI） | 0.6.0 | ✅ |
| **M10 HostAdapter / 换机 / 可恢复** | **0.6.1** | ✅ |

- [M8-M9](./achieve/M8-M9-p0-batch-monitor-flash.md)  
- [M10](./achieve/M10-host-adapter-migrate.md)

---

## 4. 未完成

### 已勾选（本轮）

| ID | 状态 |
|----|------|
| U20 BackendClient | ✅ |
| U21 HostAdapter | ✅ |
| 换机零绝对路径 + Doctor | ✅ |
| Flash/Monitor 可解释可恢复 | ✅ |

### P1 / 剩余

| ID | 项 |
|----|----|
| U6–U11 | 示例、profile、快捷键、i18n、调试、文档站 |
| U1+ / U2+ | 虚拟滚动；Monitor 过滤/时间戳/重连 |
| U13–U19 | 版本矩阵、Marketplace、测试、许可说明 |
| U22–U24 | confserver 协议、可插拔 Flasher、工业面板 |
| — | 删除 `runCaptured(string)` / `runStreaming(string)` |

---

## 5. 路线图

1. 删 deprecated 字符串 API + CI 冒烟  
2. 示例导入 / Monitor 增强  
3. GitHub Release + 版本矩阵  
4. 调试通路  

| 版本 | 目标 |
|------|------|
| **0.6.1** | HostAdapter + 换机 + 可恢复 ← **当前** |
| **0.7** | 示例、Monitor 增强、虚拟滚动 |
| **1.0** | 发布体系 + 调试 + 矩阵 |

---

## 6. 相关文档

| 文档 | 说明 |
|------|------|
| [DEVELOPMENT_GUIDE.md](./DEVELOPMENT_GUIDE.md) | 开发纪律 |
| [INDUSTRIAL_GAP_ANALYSIS.md](./INDUSTRIAL_GAP_ANALYSIS.md) | 商用缺口 |
| [achieve/](./achieve/) | M1–M10 |
| [../CHANGELOG.md](../CHANGELOG.md) | 变更 |
| [GitHub](https://github.com/TachengXiaochen/ws63-ide) | 源码 |

---

## 7. 修订记录

| 日期 | 说明 |
|------|------|
| 2026-07-09 | v0.1 |
| 2026-07-18 | v0.2–v0.4 P0 |
| 2026-07-18 | **v0.5** M10：HostAdapter/BackendClient、换机、可恢复；基线 0.6.1 |
