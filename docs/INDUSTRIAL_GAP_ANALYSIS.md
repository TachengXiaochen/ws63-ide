# WS63 IDE — 工业级 / 商用开源缺口与改进清单

> **目的**：对照 ESP-IDF Extension，记录当前扩展（≈0.4.x）距工业级、商用开源仍需改善与补充的能力。  
> **用途**：后续排期与优化依据；非实现规格书。  
> **创建**：2026-07-17  
> **对照基准**：Espressif ESP-IDF VS Code Extension（含 EIM、SDK Config、Doctor、Debug 等）

---

## 0. 当前定位（一句话）

WS63 IDE ≈ ESP-IDF 扩展的 **「Build / Flash / Monitor + 半成品 menuconfig」MVP**。  
工作流原型可用，**尚未达到可对外宣称「生产可用 / 商用开源」的产品完整度**。

| 能力域 | WS63 IDE (≈0.4.x) | ESP-IDF Extension |
|--------|-------------------|-------------------|
| Build / Flash / Monitor | 有 | 成熟 |
| SDK Config (menuconfig UI) | 有雏形（confserver 子集） | 完整 + 搜索 / 依赖 / 多配置 |
| New Project | 有简单向导 | 模板库 + 多框架 |
| 环境安装 / Doctor | 无 | EIM + Doctor |
| Debug (JTAG / GDB) | 无 | OpenOCD / QEMU / coredump |
| 测试 / 尺寸分析 / 分区 | 无 | Unity / size / NVS / partition |
| Marketplace / 文档 / CI | 本地 VSIX | 官方发布体系 |

---

## 1. 工业级开源硬门槛（不做不宜谈商用）

### 1.1 工程与发布

- [ ] 真实 GitHub org / 仓库（非 `github.com/local/...` 占位）
- [ ] LICENSE（建议 Apache-2.0 或 MIT）
- [ ] CHANGELOG + 语义化版本（SemVer）
- [ ] GitHub Releases（附 VSIX + checksum）
- [ ] CI：`tsc` / lint / pytest / 打 VSIX / 产物校验
- [ ] Marketplace 上架，或至少可复现的 `vsce publish` 流水线
- [ ] **扩展 ↔ SDK 版本矩阵**：明确支持哪些 `fbb_ws63` 版本；不兼容时明确报错

### 1.2 环境与可移植性

- [ ] **零绝对路径**：SDK / backend / Python / 烧录工具全部自动探测或向导配置（0.4.3 仅起步）
- [ ] **Setup Wizard / Doctor**：检查 `python3`、pip 依赖、`build.py`、串口代理、WSL distro、烧录工具
- [ ] **跨平台策略写死并测通**：
  - Linux / Remote-WSL（建议主路径）
  - Windows 宿主 + WSL
  - 纯 Windows（若不支持，文档必须写死「不支持」）
- [ ] Python 依赖锁定（`requirements.txt` + 可选 venv）；缺依赖可一键安装
- [ ] 用户升级后清理旧版写入的绝对路径（迁移 / 提示清空）

### 1.3 质量与安全

- [ ] 自动化测试：backend 单元测试 + extension 冒烟（可 mock shell）
- [ ] 错误可行动：失败时说明「缺什么 / 怎么修」，避免只报 `code 1`
- [ ] Doctor 报告可导出；默认脱敏路径 / 串口号
- [ ] Webview CSP；命令参数 **禁止裸字符串拼接**（须 shell-escape / argv 数组）
- [ ] Telemetry 可选、默认关闭

### 1.4 法律与供应链

- [ ] 第三方二进制（`ws63flash`、BurnTool 等）许可证与分发权理清
- [ ] SBOM / 依赖审计（npm + pip）
- [ ] 对外定位写清：官方推荐工具 vs 社区第三方（影响信任与责任边界）

---

## 2. 对标 ESP-IDF：功能缺口（按优先级）

### P0 — 每天都用，缺了就不像 IDE

| ID | 项 | 说明 |
|----|----|------|
| P0-1 | 完整 SDK Configuration Editor | choice / int / hex / string、依赖灰显、搜索、Revert、Save & Build、大树虚拟滚动 |
| P0-2 | 可靠串口 Monitor | 独立面板（不全靠 Terminal）、端口占用检测、与 Debug Console 互斥、重连、时间戳、过滤 |
| P0-3 | Flash 可靠性 | 进度、超时、重试、复位、固件路径校验、失败分类（端口忙 / 工具缺失 / 镜像不存在） |
| P0-4 | Target / 多工程 | 选择 target；多根工作区时选择 SDK |
| P0-5 | Doctor + 首次配置向导 | 对标 EIM 的轻量版 |

### P1 — 工业开发常见刚需

| ID | 项 | 说明 |
|----|----|------|
| P1-1 | 调试通路 | UART GDB stub 或文档化的 OpenOCD/JTAG（视硬件能力） |
| P1-2 | 编译错误跳转 | Problem Matcher / `$gcc` 等，错误可点进源文件 |
| P1-3 | 示例与模板库 | 从 SDK `samples/` 导入，不限于单一 standalone 骨架 |
| P1-4 | 多配置 profile | Debug/Release、带/不带 SLE 等（类似多 sdkconfig） |
| P1-5 | 快捷键与命令面板完整覆盖 | 对标 ESP-IDF `Ctrl+E` 系 |
| P1-6 | 国际化 | 至少中英文 `package.nls` |

### P2 — ESP-IDF 有、可后置或按需砍掉

| ID | 项 | 备注 |
|----|----|------|
| P2-1 | Binary size 分析 | 按需 |
| P2-2 | 分区表 / NVS 编辑器 | 若 WS63 有对等概念再做 |
| P2-3 | Component Registry 类组件市场 | 生态成熟后再做 |
| P2-4 | QEMU / 仿真 | 有平台支持再做 |
| P2-5 | Tracing / eFuse viewer | 按芯片能力 |
| P2-6 | Copilot / Chat 工具集成 | 差异化，非 v1 必需 |
| P2-7 | Docker 官方开发镜像 | 利于 CI / 新人 |
| P2-8 | 高性能日志解码（Trice 可选集成） | 见 §8；与 IDE 主线互补，非替代 |

> **原则**：不要盲目追平 ESP-IDF 功能面；按 WS63 芯片与客户真实需求选型。盲目对齐会拖垮维护。

---

## 3. 架构结构性缺陷

| 问题 | 风险 | 建议方向 |
|------|------|----------|
| 扩展用字符串拼 `cd … && ./build.py` | 路径空格、注入、难测 | 统一 `BackendClient`：spawn 参数数组 + JSON 结果 |
| WSL / Windows 双路径逻辑散落 | 换机即坏 | 单一 `HostAdapter`（Remote / WSL-wrap / Native） |
| confserver 协议子集 | UI 与 ESP 体验差距大 | 对齐 idf confserver 语义，或自研稳定 v1 API + 版本字段 |
| backend 与 SDK 强耦合 | SDK 升级扩展易碎 | 「扩展版本 ↔ SDK 最低版本」契约测试 |
| 无插件化烧录后端 | BurnTool / ws63flash / 产线夹具难扩展 | `Flasher` 接口 + 可配置驱动 |
| UI 以 TreeView + 临时 Webview 为主 | 难做工业 UI / 主题 / 无障碍 | Config / Monitor / Doctor 等核心面板固定 Webview |

ESP-IDF 能商用的关键不只是功能多，而是：**安装可重复、错误可诊断、协议稳定、平台矩阵有 CI。**

---

## 4. 建议路线图（务实版）

### v0.5 — 可分发

- [x] 路径全自动 + backend 内置（0.4.3）
- [x] Doctor / Setup（0.5.0）
- [x] Flash / Monitor 稳定性加固（0.5.0）
- [ ] LICENSE / CI / Release
- [ ] Problem Matcher

### v0.6 — 可日常开发

- 完整 SDK Config
- 示例导入
- 多 target
- 串口专用面板
- 中英文档站点

### v1.0 — 可对外宣称「生产可用」

- 跨平台矩阵测试
- 至少一条调试通路
- 版本兼容策略
- Marketplace
- 安全基线
- 用户反馈渠道

### 刻意不进 v1.0（除非客户明确要求）

- QEMU、组件商店、全套 tracing、默认集成 Trice（见 §8）

### 建议落地顺序（近期）

1. **Doctor / Setup**（P0-5）→ 换机可诊断  
2. **Monitor / Flash 加固**（P0-2 / P0-3）→ 日常闭环不翻车  
3. 完整 SDK Config（P0-1）→ 对标 ESP 配置体验  
4. CI / LICENSE / Release + Problem Matcher（硬门槛并行）

---

## 5. 若只能先做 5 件

1. **Doctor / Setup** — 换机可装可用  
2. **可靠 Monitor + Flash** — 日常闭环不翻车  
3. **完整 Config Editor** — 对标 ESP 核心体验  
4. **CI + License + Release** — 开源可信任分发  
5. **编译错误跳转 + HostAdapter** — 工程化与跨平台根基  

这五块补齐，才具备「工业级开源扩展」的入场资格；其余是差异化与生态深度。

---

## 6. 相关文档

| 文档 | 说明 |
|------|------|
| [PLAN.md](./PLAN.md) | 原三阶段总体计划 |
| [PHASE2-2.5_PLAN.md](./PHASE2-2.5_PLAN.md) | Quick Config / 工程向导 |
| [PHASE3_PLAN.md](./PHASE3_PLAN.md) | Confserver + SDK Config |
| [achieve/](./achieve/) | 已完成里程碑记录 |
| [../README.md](../README.md) | 使用说明 |
| [DEVELOPMENT_GUIDE.md](./DEVELOPMENT_GUIDE.md) | 开发经验与开发指南（维护必读） |
| [rokath/trice](https://github.com/rokath/trice) | 可选：嵌入式高性能日志（§8） |

---

## 7. 修订记录

| 日期 | 说明 |
|------|------|
| 2026-07-17 | 初稿：基于 0.4.x 现状与 ESP-IDF 对照整理 |
| 2026-07-17 | 补充 Trice（P2-8 / §8）；调整近期落地顺序（Doctor → Monitor/Flash → Config） |

---

## 8. 可选参考：Trice（高性能日志）

> 来源：[https://github.com/rokath/trice](https://github.com/rokath/trice)  
> 定位：**固件侧超轻量 ID 日志 + PC 端解码**，不是 IDE 扩展同类项目。

| 维度 | Trice | WS63 IDE |
|------|-------|----------|
| 本质 | 目标板 `printf` 风格 → 发 ID+参数；主机用 `til.json` 还原文本 | 编译 / 烧录 / 配置 / 串口编排 |
| 痛点 | 普通 `printf` 太慢、占 Flash、中断里难打 | 换机路径、menuconfig、烧录联调 |
| 与 IDE 关系 | **互补**：可增强 Monitor 解码能力 | **主线**：Doctor / Flash / Config |

**值得借鉴**

- 主机/目标分离（与「扩展编排 + backend 干活」同构）
- Monitor 进阶：UART 收 binary → 调 `trice` 解码（现场抓 log、少占 Flash）
- 开源工程规范：LICENSE、CHANGELOG、CI、User Manual、ID 管理策略
- 传输抽象：UART / RTT / 自定义 writer → 可启发 Flash/Monitor 可插拔 Transport

**不适合现在做进主线**

- 不能替代 Doctor / Config / Flash 加固
- 默认改 SDK 全量换 `trice()` 成本高（LiteOS 应用层 + 构建 + `til.json` 治理）
- 集成前提：非阻塞发送路径、团队愿意维护 `til.json`、接受源码插 ID 工作流

**建议**：记为 **P2-8**；等 Monitor 面板稳定后，再评估「可选 Trice 解码模式」试点。
