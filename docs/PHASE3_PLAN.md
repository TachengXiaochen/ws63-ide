# WS63 IDE — Phase 3 实施计划

> **文档用途**：提交审批；批准后按本文档实施。  
> **前置条件**：Phase 1（Build/Flash/Monitor）、Phase 2（Quick Config + setconfig CLI）、Phase 2.5（New App Wizard）已完成。  
> **核心目标**：在 IDE 内提供 **ESP-IDF SDK Configuration Editor 同款** 的可视化 menuconfig 体验。

| 项 | 值 |
|----|-----|
| 文档版本 | 1.0 |
| 创建日期 | 2026-07-10 |
| SDK 根目录 | `fbb_ws63/src/` |
| 工具根目录 | `fbb_ws63/tools/ws63-ide/` |
| 默认 Build Target | `ws63-liteos-app` |
| 默认 Chip / Core | `ws63` / `acore` |
| 目标扩展版本 | **0.4.0**（Confserver MVP）→ **0.5.0**（完整树 + 搜索） |

---

## 1. 背景：对标 ESP-IDF Extension

### 1.1 ESP-IDF 侧边栏能力对照

参考 ESP-IDF Extension 侧边栏（命令 + Advanced），与 WS63 当前状态对比如下：

| ESP-IDF 命令 | WS63 现状 | Phase 3 目标 |
|--------------|-----------|--------------|
| 选择工作区文件夹 | ✅ `ws63.sdkPath` 设置 | 保持 |
| 设置设备目标 (IDF_TARGET) | ⚠️ 仅 `ws63.target` 文本配置 | Phase 3 可选：target QuickPick |
| **SDK 配置编辑器 (menuconfig)** | ⚠️ 终端 ncurses + Quick Config 3 项 | **🎯 完整 Webview 树形编辑器** |
| 构建项目 | ✅ Build + 进度面板 | 保持 |
| 烧录项目 (UART/JTAG/…) | ✅ Flash（UART） | 保持；JTAG 不在范围 |
| 监视设备 | ✅ Monitor | 保持 |
| 调试 | ❌ | 不在 Phase 3 范围 |
| 构建+烧录+监视 | ✅ 一键命令 | 保持 |
| 打开 ESP-IDF 终端 | ✅ 各命令走 Terminal/Output | 保持 |
| 彻底清理 | ⚠️ Clean Build 有，无 Full Clean 按钮 | 可选 M6 |
| **新项目向导** | ✅ Phase 2.5 New Application | 保持；与全树自动联动 |
| 展示示例项目 | ❌ | 不在 Phase 3 范围 |
| 二进制大小分析 | ❌ | 不在 Phase 3 范围 |
| 擦除 Flash | ❌ | 不在 Phase 3 范围 |
| 创建组件 | ✅ 等同 New App Wizard | 保持 |

**结论**：Phase 3 的**第一优先级**是补齐 ESP-IDF 最核心的缺口 —— **SDK Configuration Editor（可视化 menuconfig）**。其余 Build/Flash/Monitor/Wizard 已在 Phase 1–2.5 覆盖。

### 1.2 当前痛点（Phase 2 无法解决）

| 环节 | Phase 2 做法 | 仍存在的问题 |
|------|--------------|--------------|
| sle_tp 三项 | Quick Config Webview | 仅 3 个 symbol，无法覆盖 WiFi/BT/驱动等 |
| 完整配置 | 终端 `./build.py menuconfig` | ncurses 不直观；Agent 无法交互；Cursor 里体验差 |
| 新建应用后启用 | Wizard `--enable-config` | 其余子选项仍须进 menuconfig 手找 |
| 配置搜索 | 无 | 700+ 行 `.config`，手找 symbol 困难 |
| 依赖 hide/show | Quick Config 手写逻辑 | 无法自动计算 Kconfig 依赖 |

当前 `.config` 规模：`ws63_liteos_app.config` 约 **720 行 / 140 个 CONFIG_ 符号**；Kconfig 树顶层菜单包括 **Application / Bootloader / Drivers / Kernel / Middleware / Protocol / Test**（见 `src/config.in`）。

### 1.3 已有资产（直接复用）

```
tools/ws63-ide/
├── backend/
│   ├── ws63_cli.py                 # getconfig / setconfig / saveconfig（Phase 2）
│   ├── kconfig/
│   │   ├── paths.py                # .config / mconfig.h 路径（与 usr_config.py 对齐）
│   │   ├── config_cli.py           # 封装 usr_config.py
│   │   └── README.md               # Phase 3 占位
│   └── ws63_project.py             # 新建应用（Phase 2.5）
├── extension/
│   ├── providers/configProvider.ts # ConfigProvider 抽象（Phase 1 预留）
│   ├── providers/fileConfigProvider.ts  # Phase 2 快捷面板
│   └── commands/quickConfig.ts     # Quick Config Webview
└── docs/achieve/                   # M1–M4 完成报告

src/
├── config.in                       # Kconfig 根
├── build/script/usr_config.py      # kconfiglib + menuconfig + setconfig
└── build/config/target_config/ws63/menuconfig/acore/
    └── ws63_liteos_app.config      # 当前配置快照
```

---

## 2. 总体目标与非目标

### 2.1 Phase 3 目标

1. **SDK Configuration Editor Webview**  
   在 Cursor/VS Code 内打开完整 Kconfig 树，树形浏览 + checkbox/输入框编辑，**不依赖** ncurses 或 WSLg。

2. **Confserver 后端**  
   Python 子进程，stdin/stdout JSON Lines 协议（对齐 ESP-IDF `kconfserver.py` v2/v3），由 kconfiglib 计算 **values / visible / ranges**。

3. **菜单结构导出**  
   由 `config.in` 生成 `kconfig_menus.json`（静态菜单骨架），Webview 按菜单渲染；运行时值与可见性由 Confserver 推送。

4. **Save / Revert / Save & Build**  
   保存写回 `ws63_liteos_app.config` + `savemenuconfig` 生成 `mconfig.h`；与 `./build.py` 行为一致。

5. **与 Phase 2 平滑衔接**  
   `FileConfigProvider` → `ConfserverConfigProvider`；Quick Config 可保留为「收藏夹」或合并进全树搜索。

6. **Agent 可脚本化**  
   保留 `ws63_cli.py setconfig`；新增 `ws63_cli.py confserver` 供调试；Confserver 协议文档化。

### 2.2 非目标（本阶段不做）

- ❌ LSP / IntelliSense / 头文件跳转
- ❌ 调试器、OpenOCD、QEMU
- ❌ 二进制大小分析、擦除 Flash
- ❌ BS21/BS21E/WS63E 多 chip 完整 target 切换（可预留 UI，默认 ws63）
- ❌ 替代 `./build.py menuconfig` 的全部 ncurses 快捷键（Webview 够用即可）
- ❌ 在线 Kconfig 协同编辑 / 多用户

---

## 3. 架构设计

### 3.1 终态数据流（对标 ESP-IDF）

```
┌──────────────────── Cursor / VS Code Extension ────────────────────────────┐
│  命令: WS63: SDK Configuration Editor                                      │
│  侧边栏: [SDK Config]  状态栏: [⚙ SDK Config]                               │
│  ┌─ Webview: SDK Configuration ─────────────────────────────────────────┐ │
│  │  🔍 Search: sle_tp                                                    │ │
│  │  ▼ Application                                                        │ │
│  │    ☑ Enable SLE Throughput App                                        │ │
│  │    ☑ Server (RX)   ☐ Client (TX)                                      │ │
│  │  ▼ Drivers → GPIO → ...                                               │ │
│  │              [Revert]  [Save]  [Save & Build]                           │ │
│  └───────────────────────────────────────────────────────────────────────┘ │
└───────────────────────────────┬────────────────────────────────────────────┘
                                │ spawn + stdin/stdout JSON Lines
                                ▼
┌──────────────── backend/kconfig/ ──────────────────────────────────────────┐
│  confserver.py          ← 核心：kconfiglib 加载 config.in                  │
│  menu_exporter.py       ← 生成 kconfig_menus.json（菜单骨架）               │
│  paths.py / config_cli  ← 共用路径与 savemenuconfig                       │
└───────────────────────────────┬────────────────────────────────────────────┘
                                │
                                ▼
┌──────────────── SDK（受控写入）────────────────────────────────────────────┐
│  config.in  →  kconfiglib  →  ws63_liteos_app.config  →  mconfig.h         │
│  （与 usr_config.py / ./build.py menuconfig 同一路径）                      │
└────────────────────────────────────────────────────────────────────────────┘
```

### 3.2 与 ESP-IDF kconfserver 的关系

ESP-IDF 使用独立包 [`esp-idf-kconfig`](https://docs.espressif.com/projects/esp-idf-kconfig/en/latest/kconfserver/index.html)：

| ESP-IDF 组件 | WS63 Phase 3 对应 |
|--------------|-------------------|
| `kconfserver.py` | `backend/kconfig/confserver.py`（适配或 vendored） |
| `kconfig_menus.json` | `backend/kconfig/export/ws63_liteos_app_menus.json` |
| `ConfserverProcess.ts` | `extension/src/confserver/process.ts` |
| `MenuConfigPanel` Webview | `extension/src/webview/sdkConfigPanel.ts` |
| `idf.py confserver` | `ws63_cli.py confserver` |

**推荐策略**：优先 **vendored/adapt ESP-IDF kconfserver v3 协议**，仅替换 Kconfig 根路径、`.config` 路径与环境变量设置（复用 `usr_config.py` 的 `mconf_set_env` 逻辑）。这样未来可参考 ESP-IDF Extension 源码（`confServerProcess.ts`）加速 Webview 开发。

### 3.3 Confserver 协议（WS63 适配）

遵循 ESP-IDF kconfserver **v3** 子集（每行一个 JSON 请求/响应）：

**启动**（stderr 日志，stdout 首包为初始状态）：

```json
{
  "version": 3,
  "values": { "SLE_TP_APP_ENABLE": true, "SLE_TP_APP_SERVER": true },
  "visible": { "SLE_TP_APP_SERVER": true, "SLE_TP_APP_CLIENT": true, "application-menu": true },
  "ranges": {},
  "defaults": { "SLE_TP_APP_ENABLE": false },
  "warnings": {}
}
```

**客户端请求示例**：

```json
{ "version": 3, "set": { "SLE_TP_APP_CLIENT": true } }
{ "version": 3, "save": null }
{ "version": 3, "load": null }
{ "version": 3, "reset": ["SLE_TP_APP_CLIENT"] }
```

**服务端增量响应**（仅返回变化项）：

```json
{
  "version": 3,
  "values": { "SLE_TP_APP_CLIENT": true },
  "visible": { "SOME_DEP_CHILD": false }
}
```

**WS63 环境绑定**（Confserver 启动参数）：

| 参数 | 默认 | 说明 |
|------|------|------|
| `--sdk` | `ws63.sdkPath` | SDK 根（含 `config.in`） |
| `--chip` | `ws63` | 与 `usr_config.py` 一致 |
| `--core` | `acore` | menuconfig 子目录 |
| `--target` | `ws63-liteos-app` | 映射 `ws63_liteos_app.config` |
| `--menus` | 自动导出路径 | `kconfig_menus.json` |

**Save 流程**（等价于 Phase 2 `saveconfig`）：

```
Confserver save
  → kconf.write_config()           # ws63_liteos_app.config
  → kconf.write_autoconf()         # output/ws63/acore/ws63-liteos-app/mconfig.h
```

### 3.4 菜单结构导出（kconfig_menus.json）

ESP-IDF 将**静态菜单树**与**动态 values** 分离：

- `kconfig_menus.json`：菜单层级、symbol `id`、类型、prompt、help、children（构建时或首次打开时生成）
- Confserver：仅推送 values / visible / ranges 变化

WS63 实现 `menu_exporter.py`：

```bash
python3 backend/kconfig/menu_exporter.py \
  --sdk $SDK --chip ws63 --core acore --target ws63-liteos-app \
  --output backend/kconfig/export/ws63_liteos_app_menus.json
```

触发时机：
- Confserver 首次启动时若 JSON 不存在或 `config.in` 更新则自动导出
- New App Wizard patch 后，下次打开 SDK Config 自动包含新 symbol（kconfiglib 重新加载）

### 3.5 扩展侧 ConfigProvider 演进

```typescript
// Phase 2（当前）
FileConfigProvider  → 固定 3 项，CLI getconfig/setconfig

// Phase 3（目标）
ConfserverConfigProvider implements ConfigProvider {
  start(): spawn confserver
  loadTree(): menus.json + confserver values → KconfigNode[]
  setValue(id, value): send { set: { [id]: value } }
  save(): send { save: null } + savemenuconfig
  revert(): send { load: null }
  dispose(): kill confserver
}
```

`quickConfig.ts` 可改为打开同一 Webview 并 **filter 到 sle_tp 子树**，或保留独立面板作为快捷入口。

---

## 4. UI 设计（SDK Configuration Editor）

### 4.1 入口（仿 ESP-IDF）

| 入口 | 命令 ID | 说明 |
|------|---------|------|
| 命令面板 | `ws63.sdkConfig` | **WS63: SDK Configuration Editor** |
| 侧边栏 WS63 | SDK Configuration | 与 Quick Config 并列 |
| 状态栏 | `$(settings-gear) SDK Config` | 替换或并列现有 Menuconfig |
| 原 Menuconfig | `ws63.menuconfig` | 保留为「Terminal menuconfig (Advanced)」 |

### 4.2 Webview 布局

```
┌─ WS63 SDK Configuration ──────────────────────────────────────────────┐
│ Target: ws63-liteos-app    Chip: ws63    [↻ Reload] [×]               │
├───────────────────────────────────────────────────────────────────────┤
│ 🔍 Search symbols...                                                  │
├──────────────────┬──────────────────────────────────────────────────┤
│ 菜单树 (左)       │ 详情 / 编辑区 (右)                                │
│ ▼ Application    │  SLE_TP_APP_SERVER                               │
│   ☑ SLE TP App   │  bool — Enable SLE Throughput Server (RX)         │
│   ☑ Server (RX)  │  Help: WS63 RX side. Advertises as sle_tp_server… │
│   ☐ Client (TX)  │  [☑] enabled                                      │
│ ▼ Drivers        │                                                   │
│ ▼ Kernel         │                                                   │
│ ...              │                                                   │
├──────────────────┴──────────────────────────────────────────────────┤
│  ● Unsaved changes          [Revert]  [Save]  [Save & Build]         │
└───────────────────────────────────────────────────────────────────────┘
```

### 4.3 控件类型（按优先级）

| Kconfig 类型 | UI 控件 | 优先级 |
|--------------|---------|--------|
| bool | Checkbox | P0 |
| tristate | Checkbox 三态 / 下拉 | P1 |
| int / hex | 数字输入 + range 校验 | P1 |
| string | 文本输入 | P1 |
| choice | 单选列表 / 下拉 | P2 |
| menu / comment | 树节点分组 / 说明文字 | P0 |

### 4.4 交互行为

- **依赖 hide/show**：Confserver 返回 `visible` 变化后，Webview 隐藏或灰显节点（与 ESP-IDF 一致）
- **Dirty 指示**：未保存修改时标题栏 `●` 提示；关闭前确认
- **搜索**：按 symbol 名 / prompt 文本过滤树（本地过滤 menus.json + 高亮）
- **Save & Build**：Save 成功后触发 `runBuild(true)`（复用 Phase 1）
- **冲突处理**：打开 Editor 时启动 Confserver 为**单写者**；若用户同时开 terminal menuconfig，提示关闭后者

---

## 5. 里程碑分解

### M1 — Confserver 后端 MVP（backend）

**产出**：

```
backend/kconfig/
├── confserver.py       # stdin/stdout JSON v3（set/save/load）
├── menu_exporter.py    # config.in → kconfig_menus.json
├── env.py              # 抽取 usr_config mconf_set_env
└── export/
    └── ws63_liteos_app_menus.json
```

**CLI**：

```bash
python3 ws63_cli.py confserver --target ws63-liteos-app
python3 ws63_cli.py export-menus --target ws63-liteos-app
```

**验收**：
- 手动 echo JSON 到 confserver，`set SLE_TP_APP_CLIENT=true` 后 `visible` 正确变化
- `save` 后 `.config` 与 `mconfig.h` 更新
- 与 `getconfig` / terminal menuconfig 写**同一文件**

**报告**：`docs/achieve/M5-confserver-backend.md`

---

### M2 — SDK Configuration Webview（bool 项，扩展 0.4.0）

**产出**：

| 文件 | 作用 |
|------|------|
| `extension/src/confserver/process.ts` | 子进程生命周期、JSON 读写 |
| `extension/src/providers/confserverConfigProvider.ts` | ConfigProvider 实现 |
| `extension/src/webview/sdkConfigPanel.ts` | 主 Webview |
| `extension/src/commands/sdkConfig.ts` | 命令入口 |

**范围**：仅 **Application** 菜单下 bool 项（含 sle_tp、wizard 新建项）可勾选保存。

**验收**：
- 侧边栏 **SDK Configuration** 打开 Webview
- 勾选 `SLE_TP_APP_CLIENT` → Save → `.config` 出现 `CONFIG_SLE_TP_APP_CLIENT=y`
- Save & Build 编译成功

**报告**：`docs/achieve/M6-sdk-config-webview-bool.md`  
**VSIX**：`ws63-ide-0.4.0.vsix`

---

### M3 — 完整树 + 搜索 + 多类型（扩展 0.5.0）

**范围**：
- 全部顶层菜单（Drivers / Kernel / Middleware / Protocol …）
- int / string / hex / choice 控件
- 搜索框、help 面板、Revert
- 虚拟滚动（应对大菜单）

**验收**：
- 搜索 `gpio` 定位到对应项
- 修改 int 项超出 range 时 Confserver 拒绝并显示 error
- `SLE_TP_APP_ENABLE=n` 后子项隐藏
- Wizard 新建的 `TEST1_ENABLE` 出现在 Application 树中

**报告**：`docs/achieve/M7-sdk-config-full-tree.md`  
**VSIX**：`ws63-ide-0.5.0.vsix`

---

### M4 — 体验打磨与 Quick Config 整合

- Quick Config 增加「Open Full SDK Config」跳转
- 状态栏 Menuconfig 改为「Terminal (Advanced)」，主推 SDK Config
- Confserver 崩溃自动重启；保存失败 toast
- 文档更新：`README.md` + Agent confserver 调试示例

**报告**：`docs/achieve/M8-sdk-config-polish.md`

---

### M5（可选）— ESP-IDF Advanced 项

非 Phase 3 核心，按需排期：

| 功能 | 说明 |
|------|------|
| Target QuickPick | `ws63-liteos-app` / `ws63-liteos-xts` 等 |
| Full Clean 按钮 | `./build.py -c target` 等价 |
| guiconfig 入口 | WSLg 可用时作为 fallback |
| 收藏夹 | 将常用 symbol 固定到 Quick Config |

---

## 6. 与 Phase 2 / 2.5 的衔接

| Phase 2/2.5 资产 | Phase 3 处理 |
|------------------|--------------|
| `FileConfigProvider` | 保留；全树就绪后可选废弃或改为收藏夹 |
| `quickConfig.ts` | 保留入口；增加跳转全树 |
| `getconfig/setconfig/saveconfig` | **保留**，供 Agent/CI；Confserver 内部可复用 `config_cli` |
| New App Wizard | 无需改动；新 Kconfig 自动进全树 |
| Terminal menuconfig | 保留，标记为 Advanced |

---

## 7. 关键技术风险

| 风险 | 影响 | 缓解 |
|------|------|------|
| Kconfig 树过大，Webview 卡顿 | 打开慢、滚动卡 | menus.json 懒加载子树；虚拟滚动 |
| Confserver 与 terminal menuconfig 并发写 | 配置覆盖 | 打开 Editor 时提示单写者；Save 前 load |
| kconfiglib 加载 `config.in` 慢（~2–5s） | 首次打开等待 | 启动进度条；Confserver 常进程复用 |
| ESP-IDF 协议与 WS63 symbol 命名差异 | 解析错误 | 统一用 symbol 名（无 CONFIG_ 前缀，与 kconfserver 一致） |
| choice / tristate 边界情况 | UI 状态错乱 | M3 前仅 bool；逐步加类型并加测试用例 |
| WSL 路径 / Windows 扩展调 Confserver | spawn 失败 | 复用 `executor/shell.ts` Remote-WSL 检测 |

---

## 8. 测试计划

### 8.1 后端（M1）

| # | 场景 | 预期 |
|---|------|------|
| T1 | 启动 confserver | stdout 首包含 `values` + `visible` |
| T2 | set bool | 增量响应含新 value |
| T3 | set 触发依赖 | `visible` 子项变化 |
| T4 | save | `.config` + `mconfig.h` 更新 |
| T5 | load revert | 恢复磁盘状态 |
| T6 | export-menus | JSON 含 Application 节点 |

### 8.2 Webview（M2–M3）

| # | 场景 | 预期 |
|---|------|------|
| T10 | 打开 SDK Config | Application 节点可见 |
| T11 | 勾选 SLE_TP_APP_CLIENT + Save | `.config` 正确 |
| T12 | 取消 SLE_TP_APP_ENABLE | 子项隐藏 |
| T13 | 搜索 `throughput` | 定位 sle_tp 项 |
| T14 | Revert | 恢复上次 Save |
| T15 | Save & Build | 固件行为反映配置 |
| T16 | Wizard 新建 test1 | 树中出现 TEST1_ENABLE |

### 8.3 回归

- Phase 1 Build/Flash/Monitor 不受影响
- Phase 2 Quick Config 仍可用
- `python3 ws63_cli.py setconfig FOO=y --save` 与 Confserver 写同一文件

---

## 9. 工期估算

| 里程碑 | 内容 | 预估 |
|--------|------|------|
| M1 | confserver + menu_exporter | 3 天 |
| M2 | Webview bool + 扩展集成 0.4.0 | 3 天 |
| M3 | 全树 + 搜索 + 多类型 0.5.0 | 4 天 |
| M4 | 打磨 + 文档 | 1 天 |
| **合计** | | **~2 周** |

---

## 10. 审批检查清单

### 范围

- [ ] **批准 Phase 3 核心**：Confserver + SDK Configuration Editor Webview
- [ ] **批准协议选型**：对齐 ESP-IDF kconfserver v3（vendored/adapt）
- [ ] **批准分阶段交付**：0.4.0（Application bool）→ 0.5.0（全树）

### 默认行为

- [ ] Save 时同时写 `.config` + `mconfig.h`（与 Phase 2 一致）
- [ ] 保留 Terminal menuconfig 作为 Advanced 入口
- [ ] 保留 `setconfig` CLI 供 Agent 使用

### Explicitly out of scope

- [ ] 不做调试器 / OpenOCD
- [ ] 不做 BS21 多 chip 完整支持
- [ ] 不做 LSP

### 版本

- [ ] M2 发布 **ws63-ide-0.4.0.vsix**
- [ ] M3 发布 **ws63-ide-0.5.0.vsix**
- [ ] 每里程碑更新 `docs/achieve/`

---

## 11. 审批通过后第一项工作

1. 新建 `backend/kconfig/env.py`，从 `usr_config.py` 抽取 `mconf_set_env` 路径逻辑。
2. 调研 vendored `esp-idf-kconfig` 的 `kconfserver.py`，评估直接适配 vs 自研。
3. 实现 `confserver.py` 最小闭环：`启动 → set bool → save`。
4. CLI：`python3 ws63_cli.py confserver` 手动测试。
5. 撰写 `docs/achieve/M5-confserver-backend.md`。

---

## 附录 A — 命令速查（Phase 3 批准后）

```bash
SDK=/home/zyh110206/TcXc/fbb_ws63/src
CLI=$SDK/../tools/ws63-ide/backend/ws63_cli.py

# Phase 3 新增
python3 $CLI export-menus --target ws63-liteos-app
python3 $CLI confserver --target ws63-liteos-app
echo '{"version":3,"set":{"SLE_TP_APP_CLIENT":true}}' | python3 $CLI confserver --target ws63-liteos-app

# Phase 2 保留（Agent）
python3 $CLI getconfig --keys SLE_TP_APP_ENABLE,SLE_TP_APP_SERVER
python3 $CLI setconfig SLE_TP_APP_CLIENT=y --save

# 扩展
# WS63: SDK Configuration Editor  →  ws63.sdkConfig
```

## 附录 B — 参考

| 资料 | 路径 / 链接 |
|------|------------|
| Phase 1/2 总规划 | `tools/ws63-ide/docs/PLAN.md` |
| Phase 2/2.5 计划 | `tools/ws63-ide/docs/PHASE2-2.5_PLAN.md` |
| SDK menuconfig | `src/build/script/usr_config.py` |
| Kconfig 根 | `src/config.in` |
| 当前 .config | `src/build/config/target_config/ws63/menuconfig/acore/ws63_liteos_app.config` |
| ESP-IDF kconfserver 文档 | https://docs.espressif.com/projects/esp-idf-kconfig/en/latest/kconfserver/ |
| ESP-IDF Extension confserver | `espressif/vscode-esp-idf-extension` → `confServerProcess.ts` |
| ConfigProvider 接口 | `extension/src/providers/configProvider.ts` |

---

**请审阅本文档。批准后在评论中勾选 §10 检查清单，即可从 M1（confserver 后端）开始实施。**
