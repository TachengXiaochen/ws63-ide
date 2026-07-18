# Changelog

## 0.6.1 — 2026-07-18

### Reliability / 换机

- **HostAdapter** (`host/adapter.ts`): Remote-WSL / WSL-wrap / Native；进程用 argv，不用 `bash -lc` 拼串
- **BackendClient** (`host/backendClient.ts`): flash/monitor/build/doctor/ports/… 统一入口
- **零绝对路径**: 启动时 `migratePathsOnActivate` 清理他机 home / 失效 sdkPath；Doctor「Clear stale paths」
- **Flash/Monitor 可恢复**: `offerRecovery` — Stop / Select Port / Retry / Setup / Doctor
- Doctor 增加 IDE host 模式检测；Setup 引导清空自定义 backendPath

## 0.6.0 — 2026-07-18

### P0

- **Multi Monitor** (`ws63.monitorMulti`): one Terminal per serial port
- **Multi Flash** (`ws63.flashMulti`): queue/parallel port↔firmware jobs; `ws63.flashJobs` preset
- **Terminal log colors**: replace dark gray `[TAG]` with high-contrast ANSI; AI/RESULT highlights
- **Per-port lock**: different ports can run Monitor/Flash at once; Stop ends Build/Flash + Monitor/Debug
- **Flash retries**: `ws63.flashRetries` (default 1) on timeout/busy/unknown
- **SDK Config M8**: choice radio UI; confserver auto-restart on crash; menuconfig conflict warning
- **Select Target** status-bar / command; optional firmwareRel rename
- **Build diagnostics**: gcc-style lines → Problems panel; `ws63-gcc` problemMatcher
- **CI**: GitHub Actions compile + VSIX + backend smoke
- **Repository**: `https://github.com/TachengXiaochen/ws63-ide`

## 0.5.2

- Doctor fix + release smoke; Settings port hints
