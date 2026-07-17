# WS63 IDE — Phase 2 & 2.5 实施计划

> **文档用途**：提交审批；批准后按本文档实施。  
> **前置条件**：Phase 1 已完成（Build / Flash / Monitor / Stop / 进度 Webview / `ws63_cli.py`）。  
> **终态关系**：Phase 2/2.5 为 Phase 3（Confserver 完整可视化 menuconfig）的过渡与补充，**不替代** Phase 3。

| 项 | 值 |
|----|-----|
| 文档版本 | 1.0 |
| 创建日期 | 2026-07-10 |
| SDK 根目录 | `fbb_ws63/src/` |
| 工具根目录 | `fbb_ws63/tools/ws63-ide/` |
| 默认 Build Target | `ws63-liteos-app` |
| 默认 Chip | `ws63`（本阶段不支持 BS21/BS21E 向导） |

---

## 1. 背景与动机

### 1.1 当前痛点

| 环节 | 现状 | 问题 |
|------|------|------|
| Kconfig 修改 | 终端 `./build.py menuconfig`（ncurses） | 不直观；Agent 无法交互 |
| sle_tp 联调配置 | 手改 `.config` 或 menuconfig 找 symbol | 高频项 buried 在深层菜单 |
| 新建应用 | 手工复制 `sle_tp_app` + 改 7 处 SDK 注册点 | 易漏改、易冲突 |
| Agent 自动化 | 无统一 `setconfig` / `create-project` CLI | 与扩展按钮割裂 |

### 1.2 Phase 1 已有资产（直接复用）

```
tools/ws63-ide/
├── backend/ws63_cli.py          # ports / flash / monitor / read / write
├── extension/                   # v0.1.8：状态栏、进度 Webview、Stop
├── docs/PLAN.md                 # 总体规划（含 Phase 3 Confserver 草案）
└── backend/kconfig/README.md    # Phase 3 占位

src/
├── build/script/usr_config.py   # kconfiglib：setconfig / savemenuconfig / menuconfig
├── config.in + application/Kconfig
└── build/config/target_config/ws63/
    ├── config.py                # ram_component 注册
    └── menuconfig/acore/ws63_liteos_app.config
```

### 1.3 与 ESP-IDF 的对照

| ESP-IDF | Phase 2 | Phase 2.5 | Phase 3（后续） |
|---------|---------|-----------|-----------------|
| SDK Configuration Editor（部分项） | ✅ 快捷 Webview | — | ✅ 完整树 |
| `idf.py menuconfig` | 保留终端入口 | — | Webview 替代 |
| New Project Wizard | — | ✅ 应用脚手架 | — |
| `idf.py set-target` | 选 build target（设置项） | 向导内选择 | — |
| 外部独立工程 | ❌ 不在范围 | ❌ SDK 内注册 | ❌ |

---

## 2. 总体目标与非目标

### 2.1 Phase 2 目标 — 快捷 Kconfig + setconfig CLI

1. **侧边栏 Webview**：暴露 sle_tp 及少量高频 bool 配置，checkbox 即改即存。
2. **后端 CLI**：`ws63_cli.py setconfig` / `getconfig` / `saveconfig`，Agent 可脚本化。
3. **扩展命令**：`WS63: Quick Config`、可选 `WS63: Open guiconfig`。
4. **与 build 联动**：Save 后可选「提示重新 Build」或「Save & Build」。

### 2.2 Phase 2.5 目标 — New Application Wizard

1. **分步 Webview 向导**：输入项目名 → 选模板 → 选 target → 预览 diff → 生成。
2. **自动生成**：`application/<name>/` 目录、CMakeLists、Kconfig、main.c 骨架。
3. **自动注册**：patch `application/CMakeLists.txt`、`application/Kconfig`、`config.py`（ram_component）、`.config` 启用项。
4. **后端 CLI**：`ws63_project.py create` / `validate` / `list-templates`，Agent 可调用。
5. **冲突检测**：同名目录、已存在 CONFIG、ram_component 重复时中止并报告。

### 2.3 非目标（本阶段不做）

- ❌ 完整 Kconfig 树可视化（Phase 3 Confserver）
- ❌ SDK 外独立 CMake 工程（out-of-tree project）
- ❌ BS21 / BS21E / WS63E 独立 build target 向导（需完整 `target_config/<chip>/`）
- ❌ 自动修改已有 C 源码逻辑（仅脚手架 + 注册）
- ❌ LSP / IntelliSense

---

## 3. 架构设计

### 3.1 整体数据流

```
┌──────────────── Cursor / VS Code Extension ─────────────────────────────┐
│  Sidebar: Quick Config Webview (Phase 2)                                  │
│  Sidebar: New App Wizard Webview (Phase 2.5)                              │
│  Commands: ws63.quickConfig | ws63.newProject | ws63.menuconfig (保留)    │
└───────────────────────────────┬───────────────────────────────────────────┘
                                │ spawn WSL
                                ▼
┌──────────────── backend/ (Python) ────────────────────────────────────────┐
│  ws63_cli.py          — 现有：flash/monitor/ports                         │
│  kconfig/config_cli.py — Phase 2：setconfig/getconfig/saveconfig          │
│  project/wizard.py    — Phase 2.5：create/validate/list-templates         │
│  project/templates/   — Jinja2 或 str.format 模板                         │
└───────────────────────────────┬───────────────────────────────────────────┘
                                │
                                ▼
┌──────────────── SDK (只读/受控写入) ──────────────────────────────────────┐
│  usr_config.py  →  kconfiglib  →  ws63_liteos_app.config  →  mconfig.h │
│  application/<app>/  +  config.py ram_component  +  application/Kconfig   │
└───────────────────────────────────────────────────────────────────────────┘
```

### 3.2 Phase 2 与 Phase 3 边界

| 能力 | Phase 2 | Phase 3 |
|------|---------|---------|
| 配置项数量 | 固定列表（~10 项） | 全树（数百项） |
| 依赖 hide/show | 手动维护面板可见性 | kconfiglib 实时计算 |
| 通信 | 直接读写 `.config` + setconfig | Confserver JSON-RPC |
| Agent | `setconfig KEY=y` | `confserver` API |

Phase 2 的 `ConfigProvider` 接口在 Phase 1 已预留；Phase 2 实现 `FileConfigProvider`，Phase 3 替换为 `ConfserverConfigProvider`，扩展 UI 层尽量不变。

---

## 4. Phase 2 — 快捷 Kconfig 面板

### 4.1 暴露的配置项（v1）

**分组 A — SLE Throughput（联调刚需）**

| Symbol | 显示名 | 类型 | 默认关注 |
|--------|--------|------|----------|
| `SLE_TP_APP_ENABLE` | Enable SLE Throughput App | bool | y |
| `SLE_TP_APP_SERVER` | Server (RX) — WS63 侧 | bool | y |
| `SLE_TP_APP_CLIENT` | Client (TX) — 反向测试 | bool | n |

**分组 B — 构建常用（可选 v1.1）**

| Symbol | 显示名 | 类型 |
|--------|--------|------|
| `SAMPLE_ENABLE` | Enable Samples | bool |
| `ENABLE_PERIPHERAL_SAMPLE` | Peripheral Samples | bool |

> v1 仅实现**分组 A**；分组 B 在 Phase 2 验收通过后作为 2.1 小版本追加。

### 4.2 后端 CLI 规格

**新模块**：`tools/ws63-ide/backend/kconfig/config_cli.py`  
**入口**：挂到 `ws63_cli.py` 子命令（与 flash/monitor 并列）。

```bash
# 读取当前值（输出 JSON，Agent 友好）
python3 ws63_cli.py getconfig --keys SLE_TP_APP_ENABLE,SLE_TP_APP_SERVER

# 设置（可多次调用）
python3 ws63_cli.py setconfig SLE_TP_APP_ENABLE=y SLE_TP_APP_SERVER=y SLE_TP_APP_CLIENT=n

# 写回 .config 并生成 mconfig.h（封装 savemenuconfig）
python3 ws63_cli.py saveconfig --target ws63-liteos-app

# 一键：set + save
python3 ws63_cli.py setconfig SLE_TP_APP_SERVER=y --save
```

**参数约定**

| 参数 | 默认 | 说明 |
|------|------|------|
| `--chip` | `ws63` | 对应 `target_config/<chip>/` |
| `--core` | `acore` | menuconfig 子目录 |
| `--target` | `ws63-liteos-app` | 连字符 target → `.config` 文件名 |
| `--sdk` | `defaults.json` 中 sdk_path | SDK 根目录 |

**实现要点**

- 复用 `usr_config.py` 的 `mconf_set_env()` 路径逻辑，**禁止**硬编码第二条 config 路径。
- `setconfig` 传参给 `usr_config.py setconfig`（或直接 import kconfiglib，二选一；优先 **subprocess 调用 usr_config.py** 以减少与 SDK 升级冲突）。
- `saveconfig` 调用 `savemenuconfig`，确保 Build 前 `mconfig.h` 与 `.config` 一致。
- 互斥逻辑：`SLE_TP_APP_SERVER=y` 且 `SLE_TP_APP_CLIENT=y` 时 Webview 显示警告（两者可同时编译，但联调角色冲突）。

### 4.3 扩展 UI 规格

**入口**

- 侧边栏 WS63 树：`Quick Config (SLE)` 
- 命令面板：`WS63: Quick Config`
- 状态栏（可选）：`$(settings) Config` 快捷打开

**Webview 布局**

```
┌─ WS63 Quick Config ──────────────────────────────┐
│ Target: ws63-liteos-app          [Open Full ▼]  │  ← 下拉：Terminal menuconfig / guiconfig
├─────────────────────────────────────────────────┤
│ SLE Throughput App                              │
│   ☑ Enable SLE Throughput App                   │
│   ☑ Server (RX) — WS63 接收端                   │
│   ☐ Client (TX) — 反向测试                      │
├─────────────────────────────────────────────────┤
│ [Revert]  [Save]  [Save & Build]                │
└─────────────────────────────────────────────────┘
```

**交互**

| 操作 | 行为 |
|------|------|
| 打开面板 | `getconfig` 拉当前值 |
| 改 checkbox | 本地 dirty，不立即写盘 |
| Save | `setconfig` + `saveconfig` |
| Revert | 重新 `getconfig` 丢弃 dirty |
| Save & Build | Save 后触发 `ws63.build` |
| Open Full ▼ | Terminal menuconfig（已有）/ guiconfig（可选，需 WSLg） |

### 4.4 guiconfig 可选入口

Phase 2 **P2 优先级**（时间允许则做）：

```bash
cd $SDK && python3 -c "
import os
from kconfiglib import Kconfig
from guiconfig import guiconfig
os.environ['KCONFIG_CONFIG'] = 'build/config/target_config/ws63/menuconfig/acore/ws63_liteos_app.config'
guiconfig(Kconfig('config.in'))
"
```

扩展命令：`WS63: Open guiconfig (WSLg)`。无 WSLg 时提示改用 Quick Config 或 Terminal menuconfig。

### 4.5 Phase 2 目录变更

```
tools/ws63-ide/backend/
├── kconfig/
│   ├── config_cli.py       # getconfig/setconfig/saveconfig 实现
│   ├── paths.py            # target → .config 路径（与 usr_config 对齐）
│   └── presets/
│       └── sle_tp.json     # Quick Config 面板 symbol 列表
├── ws63_cli.py             # 新增子命令：getconfig/setconfig/saveconfig

tools/ws63-ide/extension/src/
├── webview/
│   ├── quickConfigPanel.ts
│   └── quickConfig.html    # 或内联 HTML 字符串（与 progressPanel 一致）
├── commands/
│   └── quickConfig.ts
└── providers/
    └── fileConfigProvider.ts   # 实现 Phase 1 预留接口
```

### 4.6 Phase 2 验收标准

- [ ] `ws63_cli.py setconfig SLE_TP_APP_SERVER=y --save` 后 `.config` 与 `mconfig.h` 正确更新
- [ ] Quick Config Webview 打开显示当前三项 bool 值
- [ ] Save 后 Reopen 值一致；Revert 可恢复
- [ ] Save & Build 能成功编译（`ws63-liteos-app`）
- [ ] Agent 仅通过 CLI 完成「启用 Server、禁用 Client、save、build」全流程
- [ ] 终端 menuconfig 仍可用，且与 Quick Config 写**同一** `.config` 文件
- [ ] 扩展版本升至 `0.2.0`

### 4.7 Phase 2 工期估算

| 任务 | 预估 |
|------|------|
| `config_cli.py` + ws63_cli 子命令 | 1 天 |
| Quick Config Webview | 1.5 天 |
| Save & Build / Revert 联动 | 0.5 天 |
| guiconfig 入口（可选） | 0.5 天 |
| 测试 + 文档 | 0.5 天 |
| **合计** | **3～4 天** |

---

## 5. Phase 2.5 — New Application Wizard

### 5.1 支持范围（v1）

| 项 | v1 支持 |
|----|---------|
| Chip | **ws63** |
| Build Target | **ws63-liteos-app**（默认）；列表从 `config.py` 读取 |
| 模板 | **standalone**（sle_tp 型）、**sample**（blinky 型） |
| 项目名规则 | `[a-z][a-z0-9_]{2,31}` → CMake `COMPONENT_NAME` 用下划线 |

**不支持 v1**：BS21/BS21E 目标、新建 build target、替换 main 组件。

### 5.2 模板说明

#### 模板 A — `standalone`（参考 `sle_tp_app`）

生成结构：

```
application/<name>/
├── CMakeLists.txt          # COMPONENT_NAME "<name>"
├── Kconfig                 # CONFIG_<NAME>_ENABLE 等
├── inc/
│   └── <name>.h
└── src/
    └── <name>_main.c       # app_run() + osal_kthread 骨架
```

特点：独立 `ram_component`；源码内 `#ifdef CONFIG_*` 或 CMake 条件编译（与 sle_tp 一致）。

#### 模板 B — `sample`（参考 `blinky`）

生成结构：

```
application/samples/<category>/<name>/
├── CMakeLists.txt          # PARENT_SCOPE 追加 SOURCES
├── Kconfig                 # SAMPLE_SUPPORT_<NAME>
└── <name>_demo.c           # app_run 骨架
```

特点：`ram_component` 已有 `samples`，只需 Kconfig 门控；**额外 patch** 上级 `samples/<category>/Kconfig` 与 `CMakeLists.txt`。

**v1 默认 category**：`peripheral`（与现有 samples 树一致）。

### 5.3 SDK 注册点（向导必须 patch 的文件）

| # | 文件 | standalone 操作 | sample 操作 |
|---|------|-----------------|-------------|
| 1 | `application/<path>/` | 创建目录树 | 创建目录树 |
| 2 | `application/CMakeLists.txt` | `add_subdirectory_if_exist(<name>)` | 无需（已在 samples 下） |
| 3 | `application/Kconfig` | 新增 bool + `osource` | 无需 |
| 4 | `samples/.../Kconfig` | — | `SAMPLE_SUPPORT_<NAME>` |
| 5 | `samples/.../CMakeLists.txt` | — | `if CONFIG` + `add_subdirectory` |
| 6 | `target_config/ws63/config.py` | `ram_component += '<name>'` | 通常无需 |
| 7 | `menuconfig/.../ws63_liteos_app.config` | `CONFIG_<NAME>_ENABLE=y` | `SAMPLE_ENABLE=y` + `SAMPLE_SUPPORT_<NAME>=y` |

**Patch 原则**

- 使用**幂等**检测：已存在则跳过或报错（用户可选「仅生成目录不注册」）。
- 生成 **unified diff 预览**，用户确认后写入。
- 所有 patch 记录写入 `application/<name>/.ws63-ide.json`（向导元数据，便于卸载/文档）。

### 5.4 向导 UI 流程

```
Step 1  项目信息
        - 名称、描述
        - 模板：Standalone / Sample
        - [Sample 时] 分类：peripheral

Step 2  构建目标
        - Build Target：ws63-liteos-app（QuickPick）
        - 说明：WS63E 同固件，无需单独选

Step 3  预览变更
        - 将创建的文件列表
        - 将 patch 的 SDK 文件 diff（语法高亮）

Step 4  生成
        - 执行 create
        - 结果：成功 / 部分成功 / 失败日志

Step 5  后续（可选勾选）
        - ☑ 打开 Quick Config
        - ☑ 立即 Build
```

### 5.5 后端 CLI 规格

**新入口**：`tools/ws63-ide/backend/project/wizard.py`  
**挂接**：`ws63_cli.py project ...` 或独立 `ws63_project.py`（推荐独立脚本 + shim，避免 ws63_cli 过长）。

```bash
# 列出模板
python3 tools/ws63-ide/backend/ws63_project.py list-templates

#  dry-run：只输出将执行的操作
python3 tools/ws63-ide/backend/ws63_project.py create my_app \
  --template standalone \
  --target ws63-liteos-app \
  --dry-run

# 实际创建
python3 tools/ws63-ide/backend/ws63_project.py create my_app \
  --template standalone \
  --target ws63-liteos-app \
  --register \
  --enable-config

# 校验项目是否已正确注册
python3 tools/ws63-ide/backend/ws63_project.py validate my_app
```

**`--enable-config`**：调用 Phase 2 的 `setconfig` 写入 `.config` 并 `saveconfig`。

### 5.6 模板引擎

- 位置：`tools/ws63-ide/backend/project/templates/`
- 格式：Jinja2（`requirements.txt` 增加 `jinja2`）或 Python `string.Template`（零依赖优先）
- 变量：`{{ name }}`, `{{ NAME }}`, `{{ name_main }}`, `{{ component_name }}`

**main.c 骨架（standalone）最小示例**：

```c
#include "app_init.h"
#include "osal_debug.h"
#include "osal_task.h"

#ifdef CONFIG_{{ NAME }}_ENABLE

#define TASK_NAME "{{ name }}_task"
#define TASK_STACK 0x2000
#define TASK_PRIO  26

static void {{ name }}_task_fn(void)
{
    osal_printk("[{{ name }}] started\r\n");
    while (1) {
        osal_msleep(1000);
    }
}

static void {{ name }}_entry(void)
{
    osal_task *task = NULL;
    osal_kthread_lock();
    task = osal_kthread_create((osal_kthread_handler){{ name }}_task_fn,
        0, TASK_NAME, TASK_STACK);
    if (task != NULL) {
        osal_kthread_set_priority(task, TASK_PRIO);
    }
    osal_kthread_unlock();
}

app_run({{ name }}_entry);

#endif /* CONFIG_{{ NAME }}_ENABLE */
```

（实施时对照 SDK 现有 `app_run` / `osal_kthread_create` 签名微调。）

### 5.7 Phase 2.5 目录变更

```
tools/ws63-ide/backend/
├── project/
│   ├── wizard.py           # create / validate / dry-run
│   ├── patcher.py          # 安全 patch CMakeLists / Kconfig / config.py
│   ├── templates/
│   │   ├── standalone/
│   │   │   ├── CMakeLists.txt.tpl
│   │   │   ├── Kconfig.tpl
│   │   │   └── src_main.c.tpl
│   │   └── sample/
│   │       ├── CMakeLists.txt.tpl
│   │       ├── Kconfig.tpl
│   │       └── demo.c.tpl
│   └── schema.py           # 项目名 / 路径校验
├── ws63_project.py         # CLI 入口

tools/ws63-ide/extension/src/
├── webview/
│   ├── newProjectWizard.ts
│   └── newProjectWizard.html
├── commands/
│   └── newProject.ts
```

侧边栏 WS63 树新增：**New Application…**

### 5.8 Phase 2.5 验收标准

- [ ] 向导创建 `standalone` 项目 `demo_app`，7 处注册正确，`./build.py -c ws63-liteos-app` 通过
- [ ] 向导创建 `sample` 项目 `demo_blinky2`，menuconfig 中可启用，编译通过
- [ ] `dry-run` 不写盘，输出与真实 create 一致
- [ ] 同名项目 / 已存在 `ram_component` 时报错清晰
- [ ] `ws63_project.py validate demo_app` 检查 CMake/Kconfig/config 一致性
- [ ] Agent 通过 CLI 完成 create + setconfig + build 全流程
- [ ] 扩展版本升至 `0.3.0`

### 5.9 Phase 2.5 工期估算

| 任务 | 预估 |
|------|------|
| 模板 + wizard.py 核心 | 2 天 |
| patcher（幂等 + diff 预览） | 1.5 天 |
| New Project Webview 向导 | 1.5 天 |
| standalone + sample 联调编译 | 1 天 |
| validate + 文档 | 0.5 天 |
| **合计** | **6～7 天** |

---

## 6. 实施顺序与里程碑

```
Week 1          Week 2              Week 3（缓冲）
────────        ────────            ────────────
Phase 2         Phase 2.5           联调 / 文档 / 发布
config_cli      wizard + patcher
Quick Config    New Project UI
0.2.0 vsix      0.3.0 vsix
```

**依赖关系**：Phase 2.5 的 `--enable-config` 依赖 Phase 2 的 `setconfig/saveconfig`；建议 **先完成 Phase 2 再启动 2.5**。

### 里程碑

| 里程碑 | 交付物 | 版本 |
|--------|--------|------|
| M1 | `ws63_cli.py setconfig/getconfig/saveconfig` | backend |
| M2 | Quick Config Webview + Save & Build | ext 0.2.0 |
| M3 | `ws63_project.py create` standalone | backend |
| M4 | New Project Wizard UI | ext 0.3.0 |
| M5 | sample 模板 + 文档更新 | ext 0.3.0 |

---

## 7. 风险与缓解

| 风险 | 影响 | 缓解 |
|------|------|------|
| `usr_config.py` SDK 升级变更 | setconfig 失败 | subprocess 调用官方脚本；paths 单点封装 |
| patch `config.py` 语法错误 | 全 SDK 无法 build | dry-run + Python ast 校验；仅 append 字符串到 list |
| Quick Config 与 terminal menuconfig 并发写 | config 覆盖 | 文档说明；Save 前 reload；Phase 3 单写者 |
| sample 模板 patch 漏层级 Kconfig | 编译找不到 symbol | validate 子命令 + 集成测试 |
| WS63E / BS21 用户期望选 chip | 体验落差 | 向导 Step 2 明确说明 v1 仅 ws63 |

---

## 8. 与 Phase 3 的衔接

Phase 2/2.5 完成后：

1. **Quick Config** 面板 symbol 列表迁移为 Confserver「收藏夹」或废弃。
2. **`FileConfigProvider`** 替换为 **`ConfserverConfigProvider`**，Webview 壳层复用。
3. **New Project Wizard** 生成的 Kconfig 项**自动出现**在 Phase 3 全树中（无需改向导）。
4. **`setconfig` CLI 保留**，供 Agent 脚本与 CI 使用。

---

## 9. 审批检查清单

请审批时确认以下选项（可在 PR/评论中勾选）：

### 范围

- [ ] **批准 Phase 2**（Quick Config + setconfig CLI，分组 A：sle_tp 三项）
- [ ] **批准 Phase 2 可选项** guiconfig 入口（WSLg）
- [ ] **批准 Phase 2.5**（New App Wizard，standalone + sample 模板）
- [ ] **批准 Phase 2 → 2.5 顺序**（先 2 后 2.5）

### 默认行为

- [ ] standalone 模板默认 **register ram_component + enable .config**
- [ ] 向导 patch 前 **必须展示 diff 预览**
- [ ] Save & Build 作为 Quick Config 默认推荐操作（非自动）

### Explicitly out of scope（确认不做）

- [ ] 本阶段不做 BS21/BS21E chip 向导
- [ ] 本阶段不做完整 Confserver（Phase 3 单独审批）

### 版本与文档

- [ ] 发布后更新 `tools/ws63-ide/README.md`（Agent 调用示例）
- [ ] 扩展版本：Phase 2 → **0.2.0**，Phase 2.5 → **0.3.0**

---

## 10. 审批通过后第一项工作

1. 创建 `backend/kconfig/config_cli.py`，实现 `getconfig` / `setconfig` / `saveconfig`。
2. 扩展 `ws63_cli.py` 子命令并补充 README Agent 示例。
3. 提交 **M1** 供冒烟：`setconfig SLE_TP_APP_SERVER=y --save` + `./build.py ws63-liteos-app`。

---

## 附录 A — Agent 命令速查（批准后可用）

```bash
SDK=/home/zyh110206/TcXc/fbb_ws63/src
CLI=$SDK/../tools/ws63-ide/backend/ws63_cli.py
PROJ=$SDK/../tools/ws63-ide/backend/ws63_project.py

# Phase 2
python3 $CLI getconfig --keys SLE_TP_APP_ENABLE,SLE_TP_APP_SERVER
python3 $CLI setconfig SLE_TP_APP_SERVER=y SLE_TP_APP_CLIENT=n --save

# Phase 2.5
python3 $PROJ create my_app --template standalone --dry-run
python3 $PROJ create my_app --template standalone --register --enable-config

# Build（Phase 1 已有）
cd $SDK && ./build.py -c ws63-liteos-app
```

## 附录 B — 参考文件

| 用途 | 路径 |
|------|------|
| Kconfig 驱动 | `src/build/script/usr_config.py` |
| 应用 Kconfig 注册 | `src/application/Kconfig` |
| standalone 范例 | `src/application/sle_tp_app/` |
| sample 范例 | `src/application/samples/peripheral/blinky/` |
| ram_component | `src/build/config/target_config/ws63/config.py` |
| 当前 .config | `src/build/config/target_config/ws63/menuconfig/acore/ws63_liteos_app.config` |
| 第三方移植指南 | `docs/zh-CN/software/第三方软件 移植指南/` |
| Phase 1/3 总规划 | `tools/ws63-ide/docs/PLAN.md` |

---

**请审阅本文档。批准后在 issue/评论中勾选 §9 检查清单，即可按 §6 里程碑开始实施。**
