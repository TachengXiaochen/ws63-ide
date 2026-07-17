# M7 — Doctor / Setup + Monitor / Flash hardening (v0.5.0)

## Summary

Implements industrial P0 items from `docs/INDUSTRIAL_GAP_ANALYSIS.md`:

1. **Doctor / Setup** — environment diagnose + first-run wizard  
2. **Monitor / Flash hardening** — shared preflight, port lock, error taxonomy  

## Backend

| Piece | Path |
|-------|------|
| Doctor engine | `backend/core/doctor.py` |
| CLI | `ws63_cli.py doctor [--format json\|markdown] --sdk … -p …` |
| ws63flash resolve | `core/paths.py` → `resolve_ws63flash()` (extension + repo third_party) |

Exit code: `0` if overall ≠ fail, else `1` (warn still 0).

## Extension

| Piece | Path |
|-------|------|
| Types / hints | `extension/src/diagnose/types.ts` |
| Runner / preflight | `extension/src/diagnose/runner.ts` |
| Port lock | `extension/src/diagnose/portLock.ts` |
| Doctor UI | `extension/src/commands/doctor.ts` |
| Setup | `ws63.setup` + activate `maybeOfferSetup` |
| Flash | preflight → lock → classify errors → offer Monitor |
| Monitor / Debug / Send | preflight + exclusive port lock |

Commands: `ws63.doctor`, `ws63.setup`  
Sidebar Advanced + status bar **Doctor**.

## Packaging

- `scripts/sync-backend.js` copies **backend** and **third_party** into the VSIX  
- Version **0.5.0**

## Manual test

```bash
python3 tools/ws63-ide/backend/ws63_cli.py doctor --sdk <sdk> -p COM19
# Install ws63-ide-0.5.0.vsix → Reload
# Advanced → Doctor / Setup
# Open Monitor then Flash → should prompt to release port
# Flash without firmware → blocked with FIRMWARE_MISSING
```
