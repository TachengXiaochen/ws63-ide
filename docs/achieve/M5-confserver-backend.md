# M5 — Confserver 后端（kconfig confserver v3）

| 项 | 值 |
|----|-----|
| 完成日期 | 2026-07-10 |
| 里程碑 | Phase 3 — M5 |

## 完成内容

```
backend/kconfig/
├── env.py              # mconf_set_env 路径（对齐 usr_config.py）
├── menu_exporter.py    # config.in → JSON 菜单树
├── confserver.py       # stdin/stdout JSON v3（set/save/load）
└── export/
    └── ws63_liteos_app_menus.json  (~200KB, 9 顶层菜单)
```

### ws63_cli.py 新子命令

| 命令 | 说明 |
|------|------|
| `export-menus` | 导出菜单 JSON |
| `confserver` | 交互式 confserver（`--request` 单次测试） |

## 测试记录

```bash
python3 ws63_cli.py export-menus --target ws63-liteos-app
python3 ws63_cli.py confserver --request '{"version":3,"set":{"SLE_TP_APP_CLIENT":true}}'
printf '{"version":3,"save":null}\n' | python3 ws63_cli.py confserver --target ws63-liteos-app
```

- 初始状态含 **534** 个 symbol values
- `set SLE_TP_APP_CLIENT=true` → 响应 `values.SLE_TP_APP_CLIENT: true`
- `save` → `.config` 出现 `CONFIG_SLE_TP_APP_CLIENT=y`，并生成 `mconfig.h`

## 协议

对齐 ESP-IDF kconfserver **v3 子集**：`values` / `visible` / `ranges` / `defaults` / `set` / `save` / `load`

## 下一步

M6：扩展 SDK Configuration Webview（0.4.0）
