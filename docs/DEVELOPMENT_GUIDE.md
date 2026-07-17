# WS63 IDE — 开发经验与开发指南

> **读者**：后续维护本仓库的自己 / 同事 / 外部贡献者  
> **范围**：`tools/ws63-ide/`（Python backend + VS Code/Cursor 扩展）  
> **当前基线版本**：扩展 **0.5.2**（2026-07）  
> **对标产品**：Espressif ESP-IDF VS Code Extension（架构与体验，非功能 1:1）

本文总结从 MVP 到 0.5.x 的**架构决策、踩坑、发布纪律与日常开发流程**。  
缺口与商用路线见 [INDUSTRIAL_GAP_ANALYSIS.md](./INDUSTRIAL_GAP_ANALYSIS.md)。

---

## 1. 一句话定位

WS63 IDE = **扩展只做 UI / 编排** + **Python CLI 做全部重活**（编译调用、烧录、串口、Kconfig）。

```
Cursor / VS Code Extension (TypeScript)
        │  spawn / terminal
        ▼
backend/ws63_cli.py  (+ portio / flash / kconfig)
        │
        ├── ./build.py          （SDK 内，由 sdkPath 定位）
        ├── ws63flash.exe       （VSIX 内 third_party 或仓库 third_party）
        └── Windows python.exe  （可选：WSL 访问 COM* 的代理）
```

**原则**：Agent、终端、扩展共用同一套 `ws63_cli.py`，避免「扩展一套逻辑、脚本另一套」。

---

## 2. 目录结构（必读）

```
tools/ws63-ide/
├── README.md                 # 用户向简介
├── docs/
│   ├── DEVELOPMENT_GUIDE.md  # ← 本文
│   ├── INDUSTRIAL_GAP_ANALYSIS.md
│   ├── PLAN.md / PHASE*_PLAN.md
│   └── achieve/              # 里程碑完成报告 M1–M7
├── backend/                  # ★ 源码真相（开发改这里）
│   ├── ws63_cli.py           # CLI 入口
│   ├── ws63_project.py       # New App 向导后端
│   ├── config/defaults.json  # 中性默认值（禁止写死本机路径）
│   ├── core/                 # paths / settings / doctor
│   ├── portio/               # 串口（勿命名 serial，与 pyserial 冲突）
│   ├── flash/                # ws63flash 封装
│   ├── kconfig/              # confserver / export-menus / presets
│   └── project/              # 工程模板与 patcher
├── third_party/
│   └── ws63flash-0.3.1/      # 烧录二进制（打包进 VSIX）
└── extension/                # VS Code 扩展
    ├── package.json          # 版本号、命令、configuration 默认值
    ├── scripts/sync-backend.js  # package 前同步 backend + third_party
    ├── src/                  # TypeScript 源码
    ├── backend/              # 打包产物副本（gitignore，勿手改）
    ├── third_party/          # 打包产物副本（gitignore，勿手改）
    └── *.vsix
```

| 改什么 | 改哪里 |
|--------|--------|
| CLI / 烧录 / 串口 / Doctor | `backend/` |
| 侧边栏 / 命令 / Settings UI | `extension/src/` |
| 默认配置项 | `extension/package.json` **且** `backend/config/defaults.json` |
| 发版内容 | `npm run package`（会自动 sync） |

---

## 3. 环境要求

### 开发机

| 组件 | 说明 |
|------|------|
| Cursor / VS Code | Remote-WSL 或 Linux 优先 |
| Node.js ≥ 18 | 扩展编译；可用 `~/.local/node-*/bin` |
| Python 3.10+ | backend；Ubuntu 22.04 的 3.10/3.12 均可 |
| `pip3 install -r backend/requirements.txt` | 至少 `pyserial` |
| SDK | 打开含 `build.py` 的目录（通常 `fbb_ws63/src`） |

### 终端用户（换机）

- 安装 VSIX → **Reload Window**
- 打开 SDK 工作区 → 跑 **WS63: Doctor**
- **不要**沿用别人的绝对路径 / 默认 `COM19`

---

## 4. 日常开发流程

### 4.1 改扩展（TypeScript）

```bash
export PATH="$HOME/.local/node-v20.18.0-linux-x64/bin:$PATH"   # 按本机 Node 调整
cd tools/ws63-ide/extension
npm install          # 首次
npm run compile      # tsc → out/
npm run watch        # 可选：监听编译
```

在 Cursor 里用 **Extension Development Host** 调试，或每次 `npm run package` 后装 VSIX。

### 4.2 改后端（Python）

直接改 `tools/ws63-ide/backend/`，用 CLI 自测：

```bash
cd tools/ws63-ide/backend
python3 ws63_cli.py doctor --sdk /path/to/sdk --format json
python3 ws63_cli.py ports
python3 -m compileall -q .    # ★ 发版前必跑，防 IndentationError 进包
```

开发期扩展若指向「仓库 sibling backend」会立刻吃到改动；  
**发 VSIX 必须 `npm run package`**，否则用户装到的仍是旧副本。

### 4.3 打包与安装

```bash
cd tools/ws63-ide/extension
npm run compile
npm run package
# 生成 ws63-ide-<version>.vsix
```

`package` 脚本会：

1. `sync-backend.js`：`../backend` → `./backend`，`../third_party` → `./third_party`
2. 重写 `backend/config/defaults.json` 为**中性空路径**
3. `vsce package --no-dependencies`

安装：Cursor → Extensions → `...` → **Install from VSIX** → Reload。

### 4.4 版本号

- 改 `extension/package.json` 的 `"version"`
- 破坏性修复 / 换机相关 → **补丁号**（如 0.5.1 → 0.5.2）
- 大功能（Doctor、完整 Config）→ **次版本**
- 在 `docs/achieve/` 补里程碑说明（建议）

---

## 5. 架构要点

### 5.1 路径解析（扩展）

实现：`extension/src/settings.ts`

| 配置 | 空默认时行为 |
|------|----------------|
| `ws63.sdkPath` | 工作区向上找 `build.py` |
| `ws63.backendPath` | `extensionPath/backend`（VSIX 内置）→ 再试 SDK 旁 `tools/ws63-ide/backend` |
| `ws63.port` | 空；必须 Select Port |
| `ws63.winPython` | 空则 backend 自动探测 `/mnt/c/.../python.exe` |

**铁律**：`package.json` / `defaults.json` **禁止**再写死 `/home/<某开发者>/...`。

### 5.2 命令执行（扩展）

实现：`extension/src/executor/shell.ts`

- Remote（WSL/SSH）：命令在远程 shell 直接跑
- Windows 宿主：`wsl -d <distro> bash -lc '...'`
- 环境变量：`PYTHONUNBUFFERED=1`，可选 `WS63_WIN_PYTHON`

### 5.3 串口模型（最易踩坑）

实现：`backend/portio/session.py` + `win_python.py`

| 主机 | 端口形态 | 条件 |
|------|----------|------|
| Linux 本机 | `/dev/ttyUSB*`、`/dev/ttyACM*` | pyserial 直开 |
| WSL → Windows COM | `COM19` 等 | 需要 **Windows python.exe** 跑 `win_worker` / `monitor.py` |
| 纯 Linux 写 `COM19` | ❌ | 不是 Python 版本问题；Doctor / `_require_openable` 应拦截 |

Monitor / Debug / Flash / Send 共用扩展侧 **`portLock`**（`diagnose/portLock.ts`），避免抢同一 COM。

### 5.4 Doctor / 预检

| 层 | 职责 |
|----|------|
| `backend/core/doctor.py` | JSON/Markdown 体检 |
| `extension/src/diagnose/runner.ts` | 调 CLI + Flash/Monitor 预检 |
| `ws63.doctor` / `ws63.setup` | UI |

Flash 前必须：固件存在、ws63flash 存在、端口合法；失败用 `diagnose/types.ts` 错误码提示。

### 5.5 Kconfig

| 能力 | 入口 |
|------|------|
| 快捷 SLE | Quick Config Webview |
| 树编辑 | SDK Config + `confserver` |
| CLI | `getconfig` / `setconfig` / `saveconfig` / `export-menus` |

配置文件路径仍由 SDK 的 `usr_config.py` / menuconfig 约定决定，扩展只传 `--sdk` / `--target`。

---

## 6. 扩展源码地图

| 路径 | 职责 |
|------|------|
| `src/extension.ts` | activate：注册命令、StatusBar、portLock、Setup 提示 |
| `src/settings.ts` | 路径解析、配置读取 |
| `src/commands/*` | Build / Flash / Monitor / Doctor / Settings / SdkConfig / NewProject… |
| `src/diagnose/*` | Doctor 报告、预检、端口锁、错误文案 |
| `src/executor/*` | shell 包装、流式日志、进度 |
| `src/sidebar/*` | ESP-IDF 风格分组树 + 彩色图标 |
| `src/confserver/process.ts` | confserver 子进程 |
| `src/ui/*` | Flash 进度面板 / Toast |

Settings UI（`commands/settings.ts`）：**Browse / QuickPick / Auto-detect**，避免纯手打路径（Cursor Settings 页用宽过滤词易卡死，故自建 QuickPick）。

---

## 7. 版本演进速览（经验时间线）

| 版本 | 关键交付 | 教训 |
|------|----------|------|
| 0.1–0.3 | Build/Flash/Monitor、Quick Config、New App | 后端与扩展分离是正确方向 |
| 0.4.x | Confserver + SDK Config 雏形、侧边栏分组 | Config 子节点、UI 分层 |
| 0.4.3 | **去掉绝对路径默认**；backend 打进 VSIX | 换机失败的根因是硬编码路径 + 未打包 Python |
| 0.5.0 | Doctor/Setup、Flash/Monitor 加固、third_party 进包 | 预检与端口锁是日常闭环刚需 |
| 0.5.1 | Settings 选择器；COM-on-Linux 明确报错 | Ubuntu 上 `COM19` ≠ 版本问题 |
| 0.5.2 | 修 Doctor 语法错误；发版前 compileall | **打包进 VSIX ≠ 能跑**；要做解压冒烟 |

里程碑详情：`docs/achieve/M1`–`M7`。

---

## 8. 血泪清单（务必遵守）

### 8.1 路径与打包

1. **禁止**把本机绝对路径写进 `package.json` default / `defaults.json` / 文档示例（可用 `<sdk>` 占位）。
2. 用户可见的脚本必须在 **`npm run package` 同步进 VSIX**（backend + third_party）。
3. `extension/backend`、`extension/third_party` 是生成物 → **只改仓库根下 `backend/`、`third_party/`**。
4. 发版前检查包内容：

```bash
unzip -l extension/ws63-ide-*.vsix | grep -E 'ws63_cli|ws63flash|doctor.py'
```

5. 发版前语法检查：

```bash
python3 -m compileall -q tools/ws63-ide/backend
```

6. 建议解压冒烟：把 VSIX 解到 `/tmp/fake-ext`，直接 `python3 .../ws63_cli.py doctor`。

### 8.2 串口与平台

7. Linux ≠ Windows：`COMx` 只在 Windows 或「WSL + Win Python 代理」下有意义。
8. Monitor 与 Debug Console **不能**同时占同一口；扩展有锁，外部 SSCOM/BurnTool 锁不住，只能提示用户关掉。
9. Flash 依赖 `ws63flash.exe`（Windows 侧）；在 WSL 里通常经 `cmd.exe` 调起。

### 8.3 扩展 / Cursor 特有

10. `workbench.action.openSettings` 用宽关键词 `"ws63"` 可能 **卡死 Cursor** → 用自建 Settings QuickPick 或 `@ext:local.ws63-ide`。
11. TreeView **不能**自定义字号 CSS；分组靠全大写标题 + 彩色 ThemeIcon。
12. 旧用户工作区可能残留错误 `ws63.sdkPath`：Doctor/Setup 提示清空，或忽略已知脏路径模式。

### 8.4 代码卫生

13. 串口包目录名用 **`portio`**，不要用 `serial`（与 PyPI pyserial 冲突）。
14. Python 里不要留 `//` JS 注释；TS/Python 混改时尤甚。
15. Shell 拼接路径必须 **quote**；长期应改为 argv 数组 spawn（见缺口文档 HostAdapter）。

---

## 9. 发版检查清单（Checklist）

发 VSIX 前勾选：

- [ ] `package.json` version 已 bump
- [ ] `backend/config/defaults.json` 无本机绝对路径
- [ ] `python3 -m compileall -q backend`
- [ ] `npm run compile` 无错误
- [ ] `npm run package` 成功
- [ ] `unzip -l` 可见 `ws63_cli.py`、`doctor.py`、`ws63flash.exe`
- [ ] 解压后 `python3 .../ws63_cli.py doctor --format json` 能出 JSON（缺 SDK 可为 fail，但**不能** Traceback）
- [ ] 本机装 VSIX → Doctor → Select Port →（可选）Build
- [ ] 更新 `docs/achieve/` 或 CHANGELOG（若已建立）
- [ ] 告知用户：**先 Doctor，清旧路径，勿抄 COM19**

---

## 10. 给终端用户的最短说明（可转发）

1. 安装 `ws63-ide-x.y.z.vsix`，Reload。  
2. 打开 SDK 目录（含 `build.py`）。  
3. 侧边栏 **Doctor**；按提示修 FAIL。  
4. **Select Port**（Linux 选 `/dev/ttyUSB*`；Windows COM 需 Win Python）。  
5. Build → Flash → Monitor。  
6. 若曾装旧版：清空工作区里 `ws63.sdkPath` / `ws63.backendPath` / 错误 `port`。

---

## 11. 后续开发优先级（摘要）

详见 [INDUSTRIAL_GAP_ANALYSIS.md](./INDUSTRIAL_GAP_ANALYSIS.md)。建议顺序：

1. 巩固 Doctor / 跨平台矩阵测试 / CI + LICENSE  
2. 完整 SDK Config（choice / 搜索 / 虚拟滚动）  
3. Problem Matcher、HostAdapter（去 shell 字符串拼接）  
4. 可选：Trice 等高性能日志（P2，非主线）

---

## 12. 相关文档索引

| 文档 | 内容 |
|------|------|
| [README.md](../README.md) | 用户简介与快速开始 |
| [PLAN.md](./PLAN.md) | 三阶段总计划 |
| [PHASE2-2.5_PLAN.md](./PHASE2-2.5_PLAN.md) | Quick Config / Wizard |
| [PHASE3_PLAN.md](./PHASE3_PLAN.md) | Confserver / SDK Config |
| [INDUSTRIAL_GAP_ANALYSIS.md](./INDUSTRIAL_GAP_ANALYSIS.md) | 商用缺口、Trice、路线图 |
| [achieve/](./achieve/) | M1–M7 实施记录 |

---

## 13. 修订记录

| 日期 | 说明 |
|------|------|
| 2026-07-17 | 初稿：汇总 0.1–0.5.2 架构、流程、血泪清单与发版纪律 |
