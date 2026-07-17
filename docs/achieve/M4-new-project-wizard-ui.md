# M4 — New Application Wizard UI（扩展 0.3.0）

| 项 | 值 |
|----|-----|
| 完成日期 | 2026-07-10 |
| 里程碑 | Phase 2.5 — M4 |
| VSIX | `tools/ws63-ide/extension/ws63-ide-0.3.0.vsix` |

## 完成内容

### 扩展新增

| 文件 | 作用 |
|------|------|
| `commands/newProject.ts` | 四步 Webview 向导 |
| `settings.ts` | 新增 `projectCliPath()` |
| `sidebar/ws63TreeProvider.ts` | **New Application** 入口 |
| `package.json` | 命令 `ws63.newProject`，版本 **0.3.0** |

### Webview 流程

1. **名称** — 校验 `[a-z][a-z0-9_]{2,31}`，可选显示标题
2. **模板** — 从 `ws63_project.py list-templates` 加载（当前 `standalone`）
3. **预览** — 调用 `create --dry-run`，展示新建文件与 SDK patch 列表
4. **生成** — `create --enable-config`，可选「生成后 Save & Build」

### 后端依赖（M3）

```bash
python3 ws63_project.py list-templates
python3 ws63_project.py create my_app --dry-run
python3 ws63_project.py create my_app --enable-config
```

## 测试记录

### CLI 回归（M3）

- `ide_demo_app` 创建 + validate + `build.py -c ws63-liteos-app` **success**
- 重复创建同名项目 → `FileExistsError`（符合预期）
- `ide_test_ui --dry-run` JSON 预览正常

### 扩展编译

```bash
cd tools/ws63-ide/extension && npm run compile && npm run package
```

产出 `ws63-ide-0.3.0.vsix`，无 TypeScript 错误。

### UI 手动验证（待用户）

1. Cursor → **Install from VSIX** → 选择 `ws63-ide-0.3.0.vsix`
2. 侧边栏 WS63 → **New Application**
3. 输入新项目名 → 预览 → 生成

## 已知限制

- v1 向导仅 **standalone**；`sample`（blinky）模板见计划 M5
- 生成后 Build 为 clean build（与 Quick Config 一致）
- 项目名冲突需用户换名或手动删除 `application/<name>/` 及 SDK patch

## 下一步（M5 / Phase 3）

- **M5**：`sample` 模板 + peripheral 层级 Kconfig patch
- **Phase 3**：Confserver 完整 menuconfig Webview
