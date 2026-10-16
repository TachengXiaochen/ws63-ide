# WS63 IDE

面向 WS63（Hi3863）的 VS Code / Cursor 开发工具，将编译、烧录、串口监视、图形化配置和环境诊断接入编辑器。

Development tools for HiSilicon WS63 (Hi3863), with build, flash, serial monitoring, visual Kconfig, and diagnostics for VS Code and Cursor.

## 项目概述

| 项目 | 说明 |
| --- | --- |
| 目标平台 | WS63 / Hi3863 SDK |
| 技术栈 | Python 后端、TypeScript 扩展、Kconfig 配置服务 |
| 扩展版本 | `0.6.1`，以 `extension/package.json` 为准 |
| 编辑器要求 | VS Code `1.85.0` 及以上，或兼容的 Cursor 版本 |

## 主要功能

- 清理构建、增量构建与编译诊断。
- 单设备与多设备烧录、串口监视、串口命令发送。
- 图形化 SDK 配置、SLE 快速配置和终端 Menuconfig。
- 新建应用、环境诊断、配置向导与任务停止。

## 快速开始

克隆仓库后，在仓库根目录安装后端依赖：

```bash
python3 -m pip install -r backend/requirements.txt
python3 backend/ws63_cli.py ports
```

编译和打包编辑器扩展：

```bash
cd extension
npm install
npm run compile
npm run package
```

在 VS Code / Cursor 中执行 `Extensions → Install from VSIX...`，选择生成的 VSIX。随后打开包含 `build.py` 的 WS63 SDK 工作区，使用侧栏或命令面板中的 `WS63:` 命令。

本仓库保存开发工具；WS63 SDK 与目标板固件位于各自工程中。

## 仓库结构

| 路径 | 内容 |
| --- | --- |
| `backend/` | CLI、串口、烧录和配置服务 |
| `backend/kconfig/` | Kconfig 解析、菜单导出和配置服务 |
| `extension/` | VS Code / Cursor 扩展与打包入口 |
| `scripts/` | 工具脚本 |
| `third_party/` | 配套第三方工具 |
| `docs/` | 开发指南、规划与阶段记录 |

## 配置说明

| 配置项 | 用途 |
| --- | --- |
| `ws63.sdkPath` | SDK 根目录；留空时从工作区探测 |
| `ws63.backendPath` | 后端目录；留空时使用扩展内置版本 |
| `ws63.port` | 默认串口；可通过 Select Port 选择 |
| `ws63.target` | 编译目标，默认 `ws63-liteos-app` |

串口名称按当前电脑选择。BurnTool、SSCOM 等程序占用串口时，需要先释放端口再烧录或监视。

## 文档导航

- [开发指南](docs/DEVELOPMENT_GUIDE.md)
- [能力差距与路线图](docs/INDUSTRIAL_GAP_ANALYSIS.md)
- [开发计划](docs/PLAN.md)
- [阶段记录](docs/achieve/)
- [变更记录](CHANGELOG.md)
- [许可证](LICENSE)
