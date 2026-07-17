# M1 — Kconfig CLI（getconfig / setconfig / saveconfig）

| 项 | 值 |
|----|-----|
| 完成日期 | 2026-07-10 |
| 里程碑 | Phase 2 — M1 |
| 版本 | backend（扩展待 M2） |

## 完成内容

### 新增文件

```
tools/ws63-ide/backend/kconfig/
├── paths.py              # .config / output 路径（与 usr_config.py 对齐）
├── config_cli.py         # getconfig / setconfig / saveconfig 实现
└── presets/sle_tp.json   # Quick Config 面板 symbol 列表（M2 使用）
```

### ws63_cli.py 新子命令

| 命令 | 说明 |
|------|------|
| `getconfig [--keys SYM ...]` | 输出 JSON，读取 bool 配置 |
| `setconfig NAME=value ... [--save]` | 调用 SDK `usr_config.py setconfig` |
| `saveconfig` | 调用 `savemenuconfig` 生成 `mconfig.h` |

## 测试记录

### 1. getconfig 默认 sle_tp 三项

```bash
python3 tools/ws63-ide/backend/ws63_cli.py getconfig
```

结果：

```json
{
  "values": {
    "SLE_TP_APP_ENABLE": true,
    "SLE_TP_APP_SERVER": true,
    "SLE_TP_APP_CLIENT": false
  }
}
```

### 2. setconfig + save

```bash
python3 ws63_cli.py setconfig SLE_TP_APP_CLIENT=n --save
```

- `.config` 无变更（已是 n）时 usr_config 输出 `No change to configuration` — 正常
- `mconfig.h` 路径：`output/ws63/acore/ws63-liteos-app/mconfig.h`

### 3. 切换 SERVER/CLIENT 再恢复

```bash
python3 ws63_cli.py setconfig SLE_TP_APP_SERVER=y SLE_TP_APP_CLIENT=y --save
python3 ws63_cli.py getconfig
python3 ws63_cli.py setconfig SLE_TP_APP_CLIENT=n --save
```

getconfig 正确反映 `CLIENT=true` 后再设回 `false`。

## 设计说明

- **不重复实现 kconfiglib 逻辑**：setconfig/save 通过 subprocess 调用官方 `usr_config.py`，与 `./build.py` 行为一致。
- **Symbol 名**：支持 `SLE_TP_APP_SERVER=y` 或 `CONFIG_SLE_TP_APP_SERVER=y`，内部统一去 `CONFIG_` 前缀。
- **getconfig**：直接解析 `.config` 文件，无需加载整棵 Kconfig 树（轻量、Agent 友好）。

## 已知限制

- 仅 bool 类型（Phase 2 Quick Config 范围）。
- `saveconfig` 需 `output/ws63/acore/ws63-liteos-app/` 目录存在（自动 `makedirs`）。
- 完整 Kconfig 树编辑留 Phase 3 Confserver。

## 下一步（M2）

- Quick Config Webview
- `FileConfigProvider` 对接上述 CLI
- 扩展命令 `ws63.quickConfig`、版本 **0.2.0**
