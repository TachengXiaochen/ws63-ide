# WS63 IDE Extension — 开发计划

> **目标愿景**：为 WS63（Hi3863）SDK 打造类似 **ESP-IDF Extension** 的 Cursor/VS Code 扩展体验。  
> **终态**：Confserver + Webview 图形化 Kconfig 编辑器（ESP-IDF SDK Configuration Editor 同款思路）。  
> **当前阶段**：先实现 **方案 B（扩展 MVP）**，为后续 Confserver 预留架构与接口。

| 文档版本 | 0.1 |
|----------|-----|
| 创建日期 | 2026-07-09 |
| SDK 根目录 | `fbb_ws63/src/` |
| 后端工具 | `tools/ws63-ide/backend/` |
| 工作区 | Cursor / VS Code（WSL2 + Windows COM） |

---

## 1. 背景与动机

### 1.1 现状痛点

| 环节 | 当前做法 | 问题 |
|------|----------|------|
| 编译 | WSL 终端 `./build.py -c ws63-liteos-app` | 命令需记忆，无一键入口 |
| menuconfig | WSL 终端 `./build.py menuconfig`，ncurses 方向键操作 | 不直观，Agent 难以交互 |
| 烧录 | BurnTool GUI 或星闪工具箱（易配错 CLI） | 工具链分散 |
| 串口 | SSCOM / 星闪工具箱 / 手动 Task | 与编译烧录割裂 |
| 联调 | 多窗口切换 | 效率低 |

### 1.2 已有资产（可直接复用）

```
fbb_ws63/
├── src/
│   ├── build.py                          # 构建入口
│   ├── config.in                         # Kconfig 根
│   ├── build/script/usr_config.py        # kconfiglib + menuconfig
│   └── build/config/target_config/ws63/menuconfig/acore/
│       └── ws63_liteos_app.config        # 当前配置快照
├── tools/
│   └── ws63-ide/                         # ★ 统一工具根（ESP-IDF 风格）
│       ├── backend/ws63_cli.py           # flash / read / monitor / check-sle
│       ├── scripts/monitor.sh            # IDE 专用串口监视
│       ├── third_party/ws63flash-0.3.1/  # 烧录工具
│       └── extension/                    # ★ Phase 1 VS Code 扩展
└── src/.vscode/tasks.json                # 临时 Task（将被扩展取代）
```

### 1.3 终态对标（ESP-IDF Extension）

| ESP-IDF 能力 | WS63 扩展对应 |
|--------------|---------------|
| Status Bar: Build / Flash / Monitor | ✅ Phase 1 |
| SDK Configuration Editor (Webview) | 🎯 Phase 3（Confserver + Webview） |
| confserver JSON 协议 | 🎯 Phase 3 |
| 设备/port 选择 | ✅ Phase 1（COM 口设置） |
| 专用 Serial Monitor 终端 | ✅ Phase 1（已实现于 devkit） |
| 错误跳转 / intellisense | ❌ 不在范围（SDK 无 LSP） |

---

## 2. 总体架构

### 2.1 三阶段路线图

```
Phase 1 (方案 B)          Phase 2 (过渡)           Phase 3 (终态)
─────────────────         ───────────────          ─────────────────
扩展 MVP                  常用项快捷面板            Confserver + Webview
状态栏 Build/Flash/Monitor  sle_tp 相关 checkbox    完整 Kconfig 树
Settings (COM/SDK路径)     guiconfig 快捷入口        搜索 / 依赖 / 保存
终端 menuconfig (过渡)                              ESP-IDF 级配置体验
        │                        │                         │
        └────────────────────────┴─────────────────────────┘
                              共用 ws63-ide/backend + kconfiglib
```

### 2.2 目标架构图（终态）

```
┌──────────────────────────────── Cursor / VS Code ────────────────────────────────┐
│                                                                                 │
│  Status Bar:  $(chip)  [Build] [Flash] [Monitor] [SDK Config ⚙]               │
│                                                                                 │
│  ┌─ Sidebar: WS63 ─────────┐    ┌─ Webview: SDK Configuration ──────────────┐  │
│  │  Target: ws63-liteos-app │    │  🔍 Search                                │  │
│  │  Port: COM19             │    │  ▼ Application                            │  │
│  │  ─────────────────────   │    │    ☑ SLE Throughput App                   │  │
│  │  [Build] [Flash]         │    │    ☑ Server (RX)  ☐ Client (TX)           │  │
│  │  [Open SDK Config]       │    │  ▼ Bluetooth / WiFi / ...                 │  │
│  └──────────────────────────┘    │              [Save] [Revert] [Build]      │  │
│                                     └──────────────────────────────────────────┘  │
│  ┌─ Terminal: WS63 Monitor (dedicated) ──────────────────────────────────────┐  │
│  │  [SLE_TP] RX: ... rate=7788 Kbps                                            │  │
│  └─────────────────────────────────────────────────────────────────────────────┘  │
│                                                                                 │
└─────────────────────────────────────────────────────────────────────────────────┘
         │                    │                         │
         ▼                    ▼                         ▼
   WSL: build.py       ws63_devkit (flash/monitor)   ws63_confserver.py
         │                    │                         │
         ▼                    ▼                         ▼
   kconfiglib            ws63flash.exe              kconfiglib + config.in
   .config               COM19 (Windows)             ws63_liteos_app.config
```

### 2.3 设计原则

1. **后端与 UI 分离**：扩展只做 UI + 命令编排；编译/烧录/串口/Kconfig 均由 Python CLI 完成，Agent 与扩展共用同一后端。
2. **Phase 1 预留 Confserver 接口**：扩展侧抽象 `ConfigProvider` 接口，Phase 1 实现 `TerminalConfigProvider`，Phase 3 替换为 `ConfserverConfigProvider`。
3. **WSL 优先**：编译与 Kconfig 在 WSL；COM 口烧录/串口经 Windows 代理（已有方案）。
4. **本地安装**：Phase 1 以 `.vsix` 本地安装为主，不上架 Marketplace。

---

## 3. Phase 1 — 方案 B（扩展 MVP）

### 3.1 范围

#### 包含（In Scope）

| 功能 | 说明 |
|------|------|
| 状态栏按钮 | Build、Flash、Monitor、Menuconfig（终端）、Clean Build |
| 侧边栏 WS63 视图 | 显示 target / port / 固件路径；重复提供按钮 |
| 设置页 | `ws63.sdkPath`、`ws63.port`、`ws63.baud`、`ws63.firmware`、`ws63.target` |
| WSL 命令执行 | 扩展在 Windows 侧，通过 `wsl` 调 WSL 内命令 |
| 串口监视 | 调用 `ws63_devkit monitor --forever`，dedicated terminal |
| 烧录 | 调用 `ws63_devkit flash` |
| 编译 | WSL 内 `./build.py -c ws63-liteos-app` |
| 输出通道 | Build/Flash 日志输出到 VS Code Output Channel 或 Terminal |
| 本地打包 | `vsce package` 生成 `.vsix` |

#### 不包含（Out of Scope — 留给 Phase 3）

- Confserver + Webview 图形 Kconfig
- guiconfig 弹窗
- 完整 Kconfig 搜索/依赖 UI
- 多 target 切换 UI（仅支持 `ws63-liteos-app` 默认值，可配置）
- LSP / 代码跳转 / 头文件补全

### 3.2 状态栏布局（仿 ESP-IDF）

```
┌──────────────────────────────────────────────────────────────────────────────┐
│  ... editor ...                                                              │
├──────────────────────────────────────────────────────────────────────────────┤
│  WS63  ws63-liteos-app  │  $(plug) COM19  │  [🔨 Build] [⚡ Flash] [📺 Monitor] [⚙ Menuconfig]  │
└──────────────────────────────────────────────────────────────────────────────┘
```

- 左侧：`WS63` 品牌 + 当前 target 名（点击打开侧边栏）
- 中间：当前 COM 口（点击打开 QuickPick 选择端口）
- 右侧：操作按钮

### 3.3 命令清单

| Command ID | 标题 | 行为 |
|------------|------|------|
| `ws63.build` | WS63: Build | `./build.py -c ws63-liteos-app` |
| `ws63.buildIncremental` | WS63: Build (incremental) | `./build.py ws63-liteos-app` |
| `ws63.flash` | WS63: Flash | `ws63_devkit flash -p {port} -f {firmware}` |
| `ws63.monitor` | WS63: Monitor | `ws63_devkit monitor --forever -p {port}` |
| `ws63.monitorStop` | WS63: Stop Monitor | 关闭 monitor terminal |
| `ws63.menuconfig` | WS63: Menuconfig (Terminal) | `./build.py menuconfig`（过渡） |
| `ws63.buildFlashMonitor` | WS63: Build + Flash + Monitor | 顺序执行三者 |
| `ws63.selectPort` | WS63: Select Port | QuickPick 列出 `ws63_devkit ports` |
| `ws63.openSettings` | WS63: Extension Settings | 打开设置页 |

### 3.4 设置项（`package.json` contributes.configuration）

```jsonc
{
  "ws63.sdkPath": {
    "type": "string",
    "default": "/home/zyh110206/TcXc/fbb_ws63/src",
    "description": "WSL 内 SDK 根目录（含 build.py）"
  },
  "ws63.target": {
    "type": "string",
    "default": "ws63-liteos-app",
    "description": "编译 target 名称"
  },
  "ws63.port": {
    "type": "string",
    "default": "COM19",
    "description": "Windows COM 口（烧录/串口）"
  },
  "ws63.monitorBaud": {
    "type": "number",
    "default": 115200
  },
  "ws63.flashBaud": {
    "type": "number",
    "default": 921600
  },
  "ws63.firmware": {
    "type": "string",
    "default": "output/ws63/fwpkg/ws63-liteos-app/ws63-liteos-app_all.fwpkg",
    "description": "相对 sdkPath 的 fwpkg 路径"
  },
  "ws63.devkitPath": {
    "type": "string",
    "default": "/home/zyh110206/TcXc/fbb_ws63/tools/ws63_devkit",
    "description": "ws63_devkit 目录（WSL 路径）"
  },
  "ws63.wslDistro": {
    "type": "string",
    "default": "Ubuntu",
    "description": "WSL 发行版名称"
  }
}
```

### 3.5 WSL 命令执行模型

扩展运行在 **Windows（Cursor 宿主）**，所有 WSL 命令统一经：

```typescript
// 伪代码
function wslExec(cmd: string, options?: { cwd?: string; terminal?: boolean }) {
  const wslCmd = `wsl -d ${distro} bash -lc 'cd ${sdkPath} && ${cmd}'`;
  if (options?.terminal) {
    // 打开 VS Code Terminal 执行（Monitor / Menuconfig）
    terminal.sendText(wslCmd);
  } else {
    // execSync / Task 捕获输出（Build / Flash）
    return exec(wslCmd);
  }
}
```

**各命令实际调用：**

| 操作 | WSL 命令 |
|------|----------|
| Build | `cd ${sdkPath} && ./build.py -c ${target}` |
| Flash | `python3 ${devkitPath}/ws63_devkit.py flash -p ${port} -f ${sdkPath}/${firmware}` |
| Monitor | `python3 ${devkitPath}/ws63_devkit.py monitor --forever -p ${port} -b ${baud}` |
| Menuconfig | `cd ${sdkPath} && ./build.py menuconfig` |
| List ports | `python3 ${devkitPath}/ws63_devkit.py ports` |

### 3.6 目录结构（Phase 1 交付物）

```
tools/ws63-vscode-extension/
├── PLAN.md                          # 本文档
├── README.md                        # 安装与使用说明
├── package.json                     # 扩展 manifest
├── tsconfig.json
├── .vscodeignore
├── src/
│   ├── extension.ts                 # activate / deactivate
│   ├── statusBar.ts                 # 状态栏按钮
│   ├── sidebar/
│   │   └── ws63View.ts              # TreeView / WebviewView
│   ├── commands/
│   │   ├── build.ts
│   │   ├── flash.ts
│   │   ├── monitor.ts
│   │   └── menuconfig.ts
│   ├── executor/
│   │   └── wslExecutor.ts           # WSL 命令封装
│   ├── config/
│   │   └── settings.ts              # 读取 ws63.* 设置
│   └── providers/
│       └── configProvider.ts        # ★ 抽象接口，Phase 3 实现 Confserver
├── media/
│   └── icon.svg                     # 扩展图标
└── out/                             # 编译产物（gitignore）
```

### 3.7 ConfigProvider 抽象（为 Phase 3 预留）

```typescript
// src/providers/configProvider.ts

interface KconfigNode {
  id: string;           // e.g. "SLE_TP_APP_ENABLE"
  name: string;         // 显示名
  type: 'bool' | 'tristate' | 'string' | 'int' | 'hex' | 'choice' | 'menu';
  value: string | boolean | number;
  visible: boolean;     // 依赖满足
  children?: KconfigNode[];
  help?: string;
}

interface ConfigProvider {
  /** 加载当前配置树 */
  loadTree(): Promise<KconfigNode[]>;
  /** 设置单个 symbol */
  setValue(id: string, value: string | boolean): Promise<void>;
  /** 保存到 .config 文件 */
  save(): Promise<void>;
  /** 丢弃未保存修改 */
  revert(): Promise<void>;
}

// Phase 1: 仅占位，menuconfig 仍走终端
class TerminalConfigProvider implements ConfigProvider {
  async loadTree() { throw new Error('Use terminal menuconfig in Phase 1'); }
  // ...
}

// Phase 3: Confserver JSON-RPC
class ConfserverConfigProvider implements ConfigProvider {
  constructor(private serverUrl: string) {}
  // ...
}
```

### 3.8 Phase 1 验收标准

- [ ] 安装 `.vsix` 后，状态栏出现 WS63 按钮组
- [ ] Build 能在 WSL 内成功编译 `ws63-liteos-app`
- [ ] Flash 能烧录 `ws63-liteos-app_all.fwpkg` 到 COM19
- [ ] Monitor 在 dedicated terminal 持续输出 `[SLE_TP]` 日志
- [ ] Menuconfig 能在终端打开 ncurses 界面（过渡功能）
- [ ] Build + Flash + Monitor 一键链路可用
- [ ] COM 口可通过 QuickPick 切换
- [ ] Agent 仍可直接调用 `ws63_devkit` CLI，与扩展互不冲突
- [ ] 扩展未启动时，devkit CLI 独立可用

### 3.9 Phase 1 工期估算

| 任务 | 预估 |
|------|------|
| 扩展脚手架 + package.json | 0.5 天 |
| WSL executor + settings | 0.5 天 |
| Build / Flash / Monitor 命令 | 1 天 |
| 状态栏 + 侧边栏 UI | 1 天 |
| 联调 + 文档 + vsix 打包 | 1 天 |
| **合计** | **3～4 天** |

---

## 4. Phase 2 — 过渡（可选，1 周）

> Phase 2 非必须，可在 Phase 1 与 Phase 3 之间按需插入。

### 4.1 常用项快捷面板（C1）

在侧边栏 Webview 中仅暴露高频配置项：

| Symbol | 显示名 | 类型 |
|--------|--------|------|
| `SLE_TP_APP_ENABLE` | Enable SLE Throughput App | bool |
| `SLE_TP_APP_SERVER` | Server (RX) | bool |
| `SLE_TP_APP_CLIENT` | Client (TX) | bool |

**实现方式：** 扩展 Webview + 后端 `ws63_devkit setconfig`（新增子命令，封装 `usr_config.py setconfig`），直接读写 `.config` 文件，**不经过 Confserver**。

```bash
# 新增 devkit 命令（Phase 2）
python3 ws63_devkit.py setconfig CONFIG_SLE_TP_APP_SERVER=y
python3 ws63_devkit.py setconfig --save   # 触发 savemenuconfig 生成 mconfig.h
```

### 4.2 guiconfig 快捷入口（可选）

扩展按钮 → WSL 执行 guiconfig（kconfiglib 自带 Tk GUI）：

```bash
cd ${sdkPath} && python3 -c "
from kconfiglib import Kconfig
from guiconfig import guiconfig
import os
os.environ['KCONFIG_CONFIG'] = 'build/config/target_config/ws63/menuconfig/acore/ws63_liteos_app.config'
guiconfig(Kconfig('config.in'))
"
```

需 WSLg 支持。作为 Phase 3 完成前的完整 Kconfig 临时方案。

---

## 5. Phase 3 — Confserver + Webview（终态）

### 5.1 目标

在 IDE 内嵌 **完整 Kconfig 配置树**，体验对标 ESP-IDF SDK Configuration Editor：

- 树形结构浏览全部 menuconfig 项
- 搜索 symbol 名称 / 提示文本
- checkbox / 下拉 / 字符串输入
- 依赖关系自动 hide/show
- Save / Revert
- Save & Build 一键

### 5.2 Confserver 设计（参考 ESP-IDF confserver）

#### 5.2.1 进程模型

```
Extension (TypeScript)
    │  stdin/stdout JSON lines  或  HTTP localhost:PORT
    ▼
ws63_confserver.py (Python, WSL)
    │  kconfiglib
    ▼
config.in  →  ws63_liteos_app.config
```

- Confserver 作为 **长期运行子进程**，扩展 activate 时启动，deactivate 时关闭
- 通信协议：**JSON Lines**（每行一个 JSON 对象，与 ESP-IDF confserver 类似）

#### 5.2.2 消息协议（草案）

**请求（Extension → Confserver）：**

```jsonc
// 获取完整树
{ "version": 2, "query": "values", "target": "ws63-liteos-app" }

// 设置值
{ "version": 2, "set": { "SLE_TP_APP_SERVER": true } }

// 保存
{ "version": 2, "save": null }

// 搜索
{ "version": 2, "search": "sle" }
```

**响应（Confserver → Extension）：**

```jsonc
// values 响应（简化）
{
  "version": 2,
  "values": {
    "SLE_TP_APP_ENABLE": { "name": "Enable SLE Throughput App", "type": "bool", "value": true, "visible": true },
    "SLE_TP_APP_SERVER": { "name": "Enable SLE Throughput Server (RX)", "type": "bool", "value": true, "visible": true },
    "SLE_TP_APP_CLIENT": { "name": "Enable SLE Throughput Client (TX)", "type": "bool", "value": false, "visible": true }
  },
  "ranges": { /* 菜单分组 */ }
}

// 保存响应
{ "version": 2, "save": { "success": true, "config_path": "build/config/.../ws63_liteos_app.config" } }
```

> 正式实现时需对照 ESP-IDF confserver 源码（`tools/kconfig_new/confserver.py`）对齐字段，此处为 WS63 适配草案。

#### 5.2.3 Confserver 实现要点

新建 `tools/ws63_devkit/ws63_confserver.py`：

```python
# 核心逻辑（伪代码）
from kconfiglib import Kconfig
import os, json, sys

def setup_env(target="ws63-liteos-app"):
    conf_path = f"build/config/target_config/ws63/menuconfig/acore/{target.replace('-','_')}.config"
    os.environ["KCONFIG_CONFIG"] = conf_path
    return Kconfig("config.in")

def handle_request(req, kconf):
    if req.get("query") == "values":
        return export_values(kconf)
    if "set" in req:
        apply_set(kconf, req["set"])
        return export_values(kconf)
    if "save" in req:
        kconf.write_config()
        return {"save": {"success": True}}
    if "search" in req:
        return search_symbols(kconf, req["search"])
```

**关键复用：** SDK 已有 `build/script/usr_config.py` 的 `mconf_set_env()` 逻辑，Confserver 应抽取共用，避免与 `./build.py menuconfig` 写不同 config 路径。

#### 5.2.4 Webview UI

```
tools/ws63-vscode-extension/
├── src/
│   └── webview/
│       ├── configPanel.ts           # WebviewPanel 管理
│       └── configView.html          # 或 React/Svelte 构建
└── media/
    └── config/                      # Webview 静态资源
        ├── main.js
        └── style.css
```

**UI 功能清单：**

| 功能 | 优先级 |
|------|--------|
| 树形菜单渲染 | P0 |
| bool 项 checkbox | P0 |
| Save / Revert 按钮 | P0 |
| 搜索框 | P1 |
| 依赖 hide/show 刷新 | P1 |
| string/int/hex 输入框 | P1 |
| choice 下拉 | P2 |
| help 文本 tooltip | P2 |
| Save & Build | P1 |
| 修改项高亮（dirty indicator） | P2 |

#### 5.2.5 与编译链路集成

保存配置后的标准流程：

```
User clicks Save
    → Confserver writes ws63_liteos_app.config
    → Confserver calls savemenuconfig (生成 mconfig.h)
    → Extension 提示 "Config saved. Rebuild?"
    → [Optional] 自动触发 ws63.build
```

`savemenuconfig` 已在 `usr_config.py` 中实现：

```python
# build/script/usr_config.py
if command == 'savemenuconfig':
    kconf.load_config()
    kconf.write_autoconf()  # → mconfig.h
```

Confserver 的 save 应等价于：`write_config()` + `write_autoconf()`。

### 5.3 Phase 3 验收标准

- [ ] 侧边栏 / 命令打开 SDK Configuration Webview
- [ ] 显示完整 Kconfig 树（至少 Application / Bluetooth / WiFi 等主要菜单）
- [ ] 勾选 `SLE_TP_APP_SERVER` 后 Save，`.config` 文件正确更新
- [ ] Save 后 `./build.py -c ws63-liteos-app` 编译结果反映配置变更
- [ ] 搜索 "sle" 能定位到 SLE 相关项
- [ ] 依赖未满足的配置项不可见或灰显
- [ ] Revert 恢复上次 Save 状态
- [ ] Confserver 崩溃可自动重启

### 5.4 Phase 3 工期估算

| 任务 | 预估 |
|------|------|
| ws63_confserver.py 核心 + 协议 | 3 天 |
| Webview 树形 UI（bool 项） | 3 天 |
| 搜索 / 依赖 / 多类型输入 | 2 天 |
| 扩展集成 Confserver 生命周期 | 1 天 |
| Save & Build 联动 + 测试 | 2 天 |
| **合计** | **~2 周** |

---

## 6. 后端 CLI 演进路线（ws63_devkit）

Phase 1 不强制改 devkit，Phase 2/3 逐步扩展：

| 阶段 | 新增 devkit 子命令 |
|------|-------------------|
| Phase 1 | （无变更，扩展直接调现有命令） |
| Phase 2 | `setconfig`、`saveconfig` |
| Phase 3 | `confserver`（启动 JSON-RPC 服务） |

```
ws63_devkit.py
├── ports
├── monitor [--forever]
├── read / write
├── flash
├── check-sle
├── setconfig          # Phase 2
├── saveconfig         # Phase 2
└── confserver         # Phase 3: --port 8801
```

---

## 7. 关键技术风险

| 风险 | 影响 | 缓解 |
|------|------|------|
| WSL 路径与 Windows 路径混用 | Flash/Monitor 失败 | 统一在 devkit 内做路径转换（已实现） |
| COM 口被占用 | Monitor/Flash 互斥 | 扩展检测占用，提示关闭其他工具 |
| menuconfig 与 Confserver 写同一 .config | 配置冲突 | Confserver 独占写入；终端 menuconfig 在 Phase 3 后标记 deprecated |
| Kconfig 树过大（700+ 行 .config） | Webview 渲染慢 | 虚拟滚动 / 懒加载 / 按菜单分组 |
| kconfiglib 依赖可见性计算 | 依赖 hide 不准 | 直接复用 kconfiglib 的 `visibility` API |
| Cursor 扩展 API 兼容性 | 安装失败 | 目标 VS Code Engine `^1.85.0`，Cursor 兼容 |
| WSLg 不可用 | guiconfig 无法弹窗 | Phase 2 guiconfig 为可选；Phase 3 Webview 不依赖 WSLg |

---

## 8. 测试计划

### 8.1 Phase 1 测试用例

| # | 场景 | 预期 |
|---|------|------|
| T1 | 状态栏 Build | WSL 编译成功，Output 无 error |
| T2 | 状态栏 Flash | ws63flash 烧录成功 |
| T3 | 状态栏 Monitor | dedicated terminal 输出 `[SLE_TP]` |
| T4 | Build+Flash+Monitor | 顺序执行无报错 |
| T5 | 切换 COM 口 | QuickPick 选择后 Flash/Monitor 用新端口 |
| T6 | 扩展禁用 | devkit CLI 仍独立可用 |
| T7 | COM 被占用 | 扩展给出明确错误提示 |
| T8 | sdkPath 配错 | 扩展提示路径无效 |

### 8.2 Phase 3 测试用例

| # | 场景 | 预期 |
|---|------|------|
| T10 | Webview 加载配置树 | Application 节点可见 |
| T11 | 勾选 SLE_TP_APP_CLIENT | Save 后 .config 出现 `CONFIG_SLE_TP_APP_CLIENT=y` |
| T12 | 取消 SLE_TP_APP_ENABLE | 子项 SLE_TP_APP_SERVER 隐藏 |
| T13 | 搜索 "throughput" | 定位到 sle_tp 相关项 |
| T14 | Revert | 恢复 Save 前状态 |
| T15 | Save & Build | 配置变更反映到固件行为 |

---

## 9. 里程碑

```
2026-07-09   PLAN.md 完成 ← 当前
     │
     ▼  ~3-4 天
Phase 1      扩展 MVP (.vsix)，状态栏 Build/Flash/Monitor
     │
     ▼  ~1 周（可选）
Phase 2      sle_tp 快捷配置面板 + setconfig CLI
     │
     ▼  ~2 周
Phase 3      Confserver + Webview 完整 Kconfig GUI
     │
     ▼
终态         ESP-IDF 级 WS63 开发体验
```

---

## 10. Phase 1 实施任务分解（待批准后立即执行）

| # | 任务 | 产出 |
|---|------|------|
| 1 | 初始化扩展工程（yo code / 手动 scaffold） | `package.json`, `tsconfig.json` |
| 2 | 实现 `wslExecutor.ts` | WSL 命令封装 |
| 3 | 实现 `settings.ts` | 读取/校验 ws63.* 配置 |
| 4 | 实现 Build 命令 | 编译 + Output Channel |
| 5 | 实现 Flash 命令 | 调 devkit flash |
| 6 | 实现 Monitor 命令 | dedicated terminal |
| 7 | 实现 Menuconfig 命令（终端过渡） | terminal 打开 ncurses |
| 8 | 实现状态栏 + 侧边栏 | StatusBarItem + TreeView |
| 9 | 实现 ConfigProvider 接口占位 | 为 Phase 3 预留 |
| 10 | 编写 README + 打包 vsix | 安装文档 |
| 11 | 联调 sle_tp_app 全流程 | Build→Flash→Monitor 验证 |

---

## 11. 参考资料

| 资料 | 路径 / 链接 |
|------|------------|
| WS63 构建指南 | `src/application/sle_app/docs/build_guide.md` |
| WS63↔WS73 联调经验 | `src/application/sle_tp_app/docs/WS63_WS73_SLE联调经验.md` |
| ws63_devkit README | `tools/ws63_devkit/README.md` |
| SDK menuconfig 入口 | `src/build/script/usr_config.py` |
| 当前 .config | `src/build/config/target_config/ws63/menuconfig/acore/ws63_liteos_app.config` |
| sle_tp Kconfig | `src/application/sle_tp_app/Kconfig` |
| ESP-IDF confserver 参考 | ESP-IDF `tools/kconfig_new/confserver.py` |
| kconfiglib guiconfig | WSL 已安装 `guiconfig.py` |
| VS Code Extension API | https://code.visualstudio.com/api |

---

## 12. 批准清单

请确认以下事项后，开始 Phase 1 实施：

- [ ] **Phase 1 范围**（方案 B：状态栏 Build/Flash/Monitor + 终端 menuconfig 过渡）— 批准 / 调整
- [ ] **SDK 根目录**默认 `fbb_ws63/src` — 确认
- [ ] **默认 COM 口** COM19 — 确认
- [ ] **默认 target** `ws63-liteos-app` — 确认
- [ ] **安装方式** 本地 `.vsix` — 确认
- [ ] **Phase 3 终态** Confserver + Webview — 确认方向
- [ ] **Phase 2 是否跳过** 直接 Phase 1 → Phase 3 — 可选

---

> **Phase 1 状态**：✅ 已实现（2026-07-09）。扩展 VSIX：`tools/ws63-ide/extension/ws63-ide-0.1.8.vsix`  
> **Phase 2 / 2.5 详细计划**（待审批）：[`docs/PHASE2-2.5_PLAN.md`](./PHASE2-2.5_PLAN.md)  
> **Phase 3 详细计划**（待审批）：[`docs/PHASE3_PLAN.md`](./PHASE3_PLAN.md) — **SDK Configuration Editor（可视化 menuconfig）**  
> **下一步**：审批 Phase 3 后从 M1 confserver 后端开始实施。
