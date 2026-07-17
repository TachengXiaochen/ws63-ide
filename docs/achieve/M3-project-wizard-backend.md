# M3 — New Application Wizard 后端（ws63_project.py）

| 项 | 值 |
|----|-----|
| 完成日期 | 2026-07-10 |
| 里程碑 | Phase 2.5 — M3 |
| 版本 | backend（扩展 UI 见 M4） |

## 完成内容

### 新增文件

```
tools/ws63-ide/backend/project/
├── __init__.py
├── schema.py           # 项目名校验 [a-z][a-z0-9_]{2,31}
├── patcher.py          # 安全 patch SDK 注册点
├── wizard.py           # standalone 模板生成
├── templates/standalone/
│   ├── CMakeLists.txt.tpl
│   ├── Kconfig.tpl
│   └── src_main.c.tpl
└── ws63_project.py     # CLI 入口
```

### CLI 子命令

| 命令 | 说明 |
|------|------|
| `list-templates` | 列出可用模板（当前 `standalone`） |
| `create NAME [--dry-run] [--enable-config]` | 生成应用 + 注册 SDK |
| `validate NAME` | 检查 CMake / Kconfig / ram_component |

### SDK 注册点（standalone）

1. `application/<name>/` — CMakeLists、Kconfig、main.c
2. `application/CMakeLists.txt` — `add_subdirectory_if_exist(<name>)`
3. `application/Kconfig` — `<NAME>_ENABLE` 门控 + `osource`
4. `build/config/target_config/ws63/config.py` — `ram_component` 追加
5. 可选 `--enable-config` — `setconfig` + `saveconfig`

## 测试记录

### 1. dry-run

```bash
python3 ws63_project.py create ide_demo_app --dry-run
```

输出 JSON，含 `created_files` 与 `patches`，不写入磁盘。

### 2. 创建 + 启用配置

```bash
python3 ws63_project.py create ide_demo_app --enable-config
python3 ws63_project.py validate ide_demo_app
```

`validate` → **OK**；`.config` 含：

```
CONFIG_IDE_DEMO_APP_ENABLE=y
CONFIG_IDE_DEMO_APP_HEARTBEAT=y
```

### 3. 编译验证

```bash
cd src && python3 build.py -c ws63-liteos-app
```

**Build target:ws63_liteos_app success**，产物含 `ide_demo_app` 组件。

## 实施中修复的问题

| 问题 | 原因 | 修复 |
|------|------|------|
| CMake `${CMAKE_CURRENT_SOURCE_DIR}` KeyError | 误用 `string.Template` | 改为 `{{key}}` 占位符替换 |
| Kconfig 依赖环 | 内外层重复定义 `*_ENABLE` | 内层 Kconfig 仅保留子选项（参照 sle_tp_app） |
| `NULL` 未声明 | 模板缺少头文件 | 添加 `#include <stddef.h>` |
| ram_component 缩进错乱 | 在 `],` 前盲插 | 在 `'sle_tp_app',` 后插入 |

## 设计说明

- **内层 Kconfig 模式**：与 `sle_tp_app` 一致，`*_ENABLE` 仅出现在 `application/Kconfig`；`osource` 门控后内层只定义 HEARTBEAT 等子项。
- **dry-run**：Agent / M4 Webview 预览 diff 的统一入口。
- **冲突检测**：目录已存在时 `FileExistsError`；patch 已存在时 `skipped`。

## 已知限制

- v1 仅 **standalone** 模板；`sample`（blinky 型）留 M5。
- 默认 target `ws63-liteos-app`；BS21/BS21E 不在范围。
- `--enable-config` 失败时文件已创建，需手动清理或 validate 后修复 Kconfig。

## 下一步（M4）

- 扩展 Webview 多步向导：`ws63.newProject`
- 调用 `ws63_project.py --dry-run` 预览、`create --enable-config` 生成
- 打包 **ws63-ide-0.3.0.vsix**
