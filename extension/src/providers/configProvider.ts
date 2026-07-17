import { FileConfigProvider } from "./fileConfigProvider";

/** Phase 3 will add ConfserverConfigProvider here. */
export interface KconfigNode {
  id: string;
  name: string;
  type: string;
  value: string | boolean | number;
  visible: boolean;
  children?: KconfigNode[];
  help?: string;
}

export interface ConfigProvider {
  loadTree(): Promise<KconfigNode[]>;
  setValue(id: string, value: string | boolean): Promise<void>;
  save(): Promise<void>;
  revert(): Promise<void>;
}

export class TerminalConfigProvider implements ConfigProvider {
  async loadTree(): Promise<KconfigNode[]> {
    throw new Error("SDK Configuration GUI arrives in Phase 3. Use WS63: Quick Config or Menuconfig.");
  }
  async setValue(): Promise<void> {
    throw new Error("Not implemented");
  }
  async save(): Promise<void> {
    throw new Error("Not implemented");
  }
  async revert(): Promise<void> {
    throw new Error("Not implemented");
  }
}

export function createConfigProvider(): ConfigProvider {
  return new FileConfigProvider();
}
