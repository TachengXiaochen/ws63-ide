import * as vscode from "vscode";
import { backendClient } from "../host/backendClient";
import { getSettings } from "../settings";
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

export class FileConfigProvider implements ConfigProvider {
  private values: Record<string, boolean> = {};

  async loadTree(): Promise<KconfigNode[]> {
    const keys = QUICK_CONFIG_SYMBOLS.map((x) => x.id);
    const result = await backendClient.getconfig(keys);
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
    const parts = QUICK_CONFIG_SYMBOLS.map(
      (sym) => `${sym.id}=${this.values[sym.id] ? "y" : "n"}`
    );
    const result = await backendClient.setconfig(parts, true);
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
