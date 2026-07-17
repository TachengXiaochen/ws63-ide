import * as vscode from "vscode";
import { runCaptured } from "../executor/shell";
import { cliPath, getSettings } from "../settings";
import { ConfigProvider, KconfigNode } from "./configProvider";

/** Quick Config symbols (Phase 2 — sle_tp group). */
export const QUICK_CONFIG_SYMBOLS = [
  { id: "SLE_TP_APP_ENABLE", name: "Enable SLE Throughput App" },
  { id: "SLE_TP_APP_SERVER", name: "Server (RX) — WS63 接收端" },
  { id: "SLE_TP_APP_CLIENT", name: "Client (TX) — 反向测试" },
];

interface GetConfigResponse {
  values: Record<string, boolean>;
  target?: string;
}

function configBaseArgs(s: ReturnType<typeof getSettings>): string {
  return `--target ${s.target} --chip ws63 --core acore --sdk ${s.sdkPath}`;
}

export class FileConfigProvider implements ConfigProvider {
  private values: Record<string, boolean> = {};

  async loadTree(): Promise<KconfigNode[]> {
    const s = getSettings();
    const keys = QUICK_CONFIG_SYMBOLS.map((x) => x.id).join(",");
    const cmd = `python3 ${cliPath(s)} getconfig --keys ${keys} ${configBaseArgs(s)}`;
    const result = await runCaptured(cmd);
    if (result.code !== 0) {
      throw new Error(result.stderr || "getconfig failed");
    }
    let payload: GetConfigResponse;
    try {
      payload = JSON.parse(result.stdout);
    } catch {
      throw new Error("getconfig returned invalid JSON");
    }
    this.values = payload.values || {};
    return QUICK_CONFIG_SYMBOLS.map((sym) => ({
      id: sym.id,
      name: sym.name,
      type: "bool",
      value: !!this.values[sym.id],
      visible: true,
    }));
  }

  async setValue(id: string, value: string | boolean): Promise<void> {
    this.values[id] = value === true || value === "y" || value === "true";
  }

  async save(): Promise<void> {
    const s = getSettings();
    const parts = QUICK_CONFIG_SYMBOLS.map(
      (sym) => `${sym.id}=${this.values[sym.id] ? "y" : "n"}`
    );
    const cmd = `python3 ${cliPath(s)} setconfig ${parts.join(" ")} --save ${configBaseArgs(s)}`;
    const result = await runCaptured(cmd);
    if (result.code !== 0) {
      throw new Error(result.stderr || result.stdout || "setconfig failed");
    }
  }

  async revert(): Promise<void> {
    await this.loadTree();
  }
}

export function createQuickConfigProvider(): ConfigProvider {
  return new FileConfigProvider();
}
