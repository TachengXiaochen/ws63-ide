import * as vscode from "vscode";

export type PortOwner = "monitor" | "debug" | "flash" | "send";

export interface LockState {
  owner: PortOwner;
  port: string;
  terminal?: vscode.Terminal;
}

/**
 * Per-port COM ownership inside the extension.
 * Different ports can be held simultaneously (multi Monitor / Flash).
 * External tools (SSCOM/BurnTool) cannot be forced closed.
 */
class PortLock {
  /** key = normalized port string */
  private locks = new Map<string, LockState>();
  private disposable: vscode.Disposable | undefined;

  init(context: vscode.ExtensionContext): void {
    this.disposable = vscode.window.onDidCloseTerminal((t) => {
      for (const [port, state] of this.locks) {
        if (state.terminal === t) {
          this.locks.delete(port);
        }
      }
    });
    context.subscriptions.push(this.disposable);
  }

  normalize(port: string): string {
    return port.trim().toUpperCase();
  }

  current(port?: string): LockState | undefined {
    if (port) {
      return this.locks.get(this.normalize(port));
    }
    const first = this.locks.values().next();
    return first.done ? undefined : first.value;
  }

  listActive(): LockState[] {
    return [...this.locks.values()];
  }

  isHeldBy(owner: PortOwner, port?: string): boolean {
    if (port) {
      return this.locks.get(this.normalize(port))?.owner === owner;
    }
    return [...this.locks.values()].some((s) => s.owner === owner);
  }

  /**
   * Acquire port for owner. Conflict only when the *same* port is held by a different owner
   * (or by same owner with a live terminal we must replace).
   */
  async acquire(owner: PortOwner, port: string, terminal?: vscode.Terminal): Promise<boolean> {
    const key = this.normalize(port);
    const existing = this.locks.get(key);
    if (existing && existing.owner !== owner) {
      const choice = await vscode.window.showWarningMessage(
        `${port} is used by WS63 ${label(existing.owner)}. Stop it and continue?`,
        { modal: true },
        "Stop & Continue",
        "Cancel"
      );
      if (choice !== "Stop & Continue") {
        return false;
      }
      await this.releasePort(port, true);
    } else if (existing && existing.owner === owner) {
      // Reuse / replace same-owner session on this port
      await this.releasePort(port, true);
    }

    this.locks.set(key, { owner, port, terminal });
    return true;
  }

  async acquireForFlash(port: string): Promise<boolean> {
    return this.acquire("flash", port);
  }

  async releasePort(port: string, disposeTerminal = false): Promise<void> {
    const key = this.normalize(port);
    const cur = this.locks.get(key);
    this.locks.delete(key);
    if (disposeTerminal && cur?.terminal) {
      try {
        cur.terminal.sendText("\x03", false);
      } catch {
        /* ignore */
      }
      try {
        cur.terminal.dispose();
      } catch {
        /* ignore */
      }
    }
  }

  /** @deprecated use releasePort — releases all flash locks or a single current if port omitted */
  async release(disposeTerminal = false): Promise<void> {
    const ports = [...this.locks.keys()];
    for (const p of ports) {
      const st = this.locks.get(p);
      if (st?.owner === "flash" || st?.owner === "send") {
        await this.releasePort(st.port, disposeTerminal);
      }
    }
  }

  async releaseAll(disposeTerminal = false): Promise<void> {
    const ports = [...this.locks.values()].map((s) => s.port);
    for (const p of ports) {
      await this.releasePort(p, disposeTerminal);
    }
  }

  async stopOwner(owner: PortOwner): Promise<number> {
    let n = 0;
    for (const st of [...this.locks.values()]) {
      if (st.owner === owner) {
        await this.releasePort(st.port, true);
        n++;
      }
    }
    return n;
  }

  bindTerminal(owner: PortOwner, port: string, terminal: vscode.Terminal): void {
    const key = this.normalize(port);
    const st = this.locks.get(key);
    if (st?.owner === owner) {
      st.terminal = terminal;
    }
  }
}

function label(owner: PortOwner): string {
  switch (owner) {
    case "monitor":
      return "Monitor";
    case "debug":
      return "Debug Console";
    case "flash":
      return "Flash";
    case "send":
      return "Send Serial";
    default:
      return owner;
  }
}

export const portLock = new PortLock();
