#!/usr/bin/env node
/**
 * Sync ../backend → ./backend and ../third_party → ./third_party before packaging.
 * Strips caches and rewrites machine-specific defaults.
 */
const fs = require("fs");
const path = require("path");

const EXT_ROOT = path.resolve(__dirname, "..");
const SRC_BACKEND = path.resolve(EXT_ROOT, "../backend");
const DST_BACKEND = path.join(EXT_ROOT, "backend");
const SRC_TP = path.resolve(EXT_ROOT, "../third_party");
const DST_TP = path.join(EXT_ROOT, "third_party");

const SKIP_DIR = new Set(["__pycache__", ".pytest_cache", ".git", "export"]);
const SKIP_FILE = /\.(pyc|pyo)$/;

function rmrf(p) {
  if (fs.existsSync(p)) {
    fs.rmSync(p, { recursive: true, force: true });
  }
}

function copyTree(src, dst) {
  fs.mkdirSync(dst, { recursive: true });
  for (const name of fs.readdirSync(src)) {
    if (SKIP_DIR.has(name) || SKIP_FILE.test(name)) {
      continue;
    }
    const from = path.join(src, name);
    const to = path.join(dst, name);
    const st = fs.statSync(from);
    if (st.isDirectory()) {
      copyTree(from, to);
    } else {
      fs.copyFileSync(from, to);
    }
  }
}

if (!fs.existsSync(path.join(SRC_BACKEND, "ws63_cli.py"))) {
  console.error(`sync-backend: source missing: ${SRC_BACKEND}`);
  process.exit(1);
}

rmrf(DST_BACKEND);
copyTree(SRC_BACKEND, DST_BACKEND);

const defaultsPath = path.join(DST_BACKEND, "config", "defaults.json");
const defaults = {
  default_port: "",
  default_baud: 115200,
  flash_baud: 921600,
  default_target: "ws63-liteos-app",
  sdk_path: "",
  firmware_rel: "output/ws63/fwpkg/ws63-liteos-app/ws63-liteos-app_all.fwpkg",
  win_python: "",
  wsl_distro: "Ubuntu",
  burntool: "",
};
fs.writeFileSync(defaultsPath, JSON.stringify(defaults, null, 2) + "\n");
console.log(`sync-backend: ${SRC_BACKEND} → ${DST_BACKEND}`);

if (fs.existsSync(SRC_TP)) {
  rmrf(DST_TP);
  copyTree(SRC_TP, DST_TP);
  console.log(`sync-backend: ${SRC_TP} → ${DST_TP}`);
} else {
  console.warn(`sync-backend: third_party missing at ${SRC_TP} (Flash may fail)`);
}
