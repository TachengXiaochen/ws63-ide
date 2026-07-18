# WS63 IDE

WS63（Hi3863）开发工具链，对标 **ESP-IDF Extension** 架构：**后端 CLI + VS Code 扩展 + 未来 Confserver/Webview**。

## 目录结构（ESP-IDF 对照）

```
tools/ws63-ide/
├── README.md                 ← 本文件
├── docs/
│   └── PLAN.md               ← 三阶段开发计划（Phase 1/2/3）
├── backend/                  ← 类似 esp-idf/tools/（idf.py, idf_monitor.py）
│   ├── ws63_cli.py           ← 主入口（ports/flash/monitor/build helpers）
│   ├── config/defaults.json
│   ├── core/                 ← 路径、设置
│   ├── portio/               ← 串口（session, monitor, win_worker；避免与 pyserial 冲突）
│   ├── flash/                ← ws63flash 封装
│   └── kconfig/              ← Phase 3: confserver
├── scripts/                  ← IDE/CI 脚本
│   └── monitor.sh
├── third_party/              ← 外部二进制（不污染 backend 源码）
│   └── ws63flash-0.3.1/
└── extension/                ← 类似 espressif.vscode-esp-idf-extension
    ├── package.json
    └── src/
        ├── extension.ts
        ├── statusBar.ts      ← 状态栏 Build/Flash/Monitor
        ├── commands/
        ├── executor/         ← WSL / Remote 命令执行
        ├── sidebar/
        └── providers/        ← ConfigProvider（Phase 3 接入 Confserver）
```

### 与 ESP-IDF 的映射

| ESP-IDF | WS63 IDE |
|---------|----------|
| `idf.py build` | `./build.py -c ws63-liteos-app` |
| `idf.py flash` | `ws63_cli.py flash` |
| `idf.py monitor` | `ws63_cli.py monitor --forever` |
| `idf.py menuconfig` | `./build.py menuconfig`（Phase 1 终端） |
| confserver + SDK Configuration Editor | Phase 3 `backend/kconfig/confserver.py` + Webview |
| VS Code Extension | `extension/` |

## 快速开始

### 1. 后端 CLI（Agent / 终端）

```bash
cd tools/ws63-ide/backend
pip install -r requirements.txt

python3 ws63_cli.py ports
python3 ws63_cli.py monitor --forever -p COM19
python3 ws63_cli.py flash -p COM19
```

### 2. VS Code / Cursor 扩展（Phase 1）

```bash
cd tools/ws63-ide/extension
npm install
npm run compile
npm run package    # 生成 ws63-ide-0.1.0.vsix

# 或一键脚本（需 ~/.local/node 或系统 npm）
bash ../scripts/build_extension.sh
```

在 Cursor：`Extensions` → `...` → `Install from VSIX...` → 选择  
`tools/ws63-ide/extension/ws63-ide-0.1.0.vsix`。

安装后底部状态栏出现：**Build | Flash | Monitor | Menuconfig**。

### 3. 设置（`ws63.*`）

| 键 | 默认 | 说明 |
|----|------|------|
| `ws63.sdkPath` | *空 = 自动探测* | 打开含 `build.py` 的工作区即可 |
| `ws63.backendPath` | *空 = 扩展内置* | VSIX 已打包 `backend/`，一般无需配置 |
| `ws63.port` | `COM19` | 烧录/串口 |
| `ws63.target` | `ws63-liteos-app` | 编译目标 |

**重要**：不要再写死本机绝对路径。换机器后只要打开 SDK 工作区即可用。

若本机曾保存过旧版绝对路径，请在 **WS63 Settings** 里把 `SDK Path` / `Backend Path` 清空，或删掉工作区 `.vscode/settings.json` 里的 `ws63.sdkPath` / `ws63.backendPath`。

## 兼容旧路径

`tools/ws63_devkit/` 保留为 **兼容垫片**，内部转发到 `ws63-ide/backend/`。新开发请只用 `ws63-ide/`。

## 串口占用说明

若你使用 **BurnTool / SSCOM** 占用 COM 口，扩展的 Flash/Monitor 会失败并提示端口忙——这是预期行为。可继续用 BurnTool 烧录、SSCOM 看日志；Build 和 Menuconfig 不受影响。

## 文档

- **开发经验与开发指南（必读）**：[docs/DEVELOPMENT_GUIDE.md](./docs/DEVELOPMENT_GUIDE.md)
- 工业级缺口与路线图：[docs/INDUSTRIAL_GAP_ANALYSIS.md](./docs/INDUSTRIAL_GAP_ANALYSIS.md)
- 完整计划：[docs/PLAN.md](./docs/PLAN.md)
- 里程碑归档：[docs/achieve/](./docs/achieve/)
