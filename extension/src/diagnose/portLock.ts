import * as vscode from "vscode";

export type PortOwner = "monitor" | "debug" | "flash" | "send";

interface LockState {
  owner: PortOwner;
  port: string;
  terminal?: vscode.Terminal;
}

/**
 * Exclusive COM-port ownership inside the extension.
 * External tools (SSCOM/BurnTool) cannot be forced closed — we only coordinate our own sessions.
 */
class PortLock {
  private state: LockState | undefined;
  private disposable: vscode.Disposable | undefined;

  init(context: vscode.ExtensionContext): void {
    this.disposable = vscode.window.onDidCloseTerminal((t) => {
      if (this.state?.terminal === t) {
        this.state = undefined;
      }
    });
    context.subscriptions.push(this.disposable);
  }

  current(): LockState | undefined {
    return this.state;
  }

  isHeldBy(owner: PortOwner): boolean {
    return this.state?.owner === owner;
  }

  /** Returns false if user cancelled releasing another owner. */
  async acquire(owner: PortOwner, port: string, terminal?: vscode.Terminal): Promise<boolean> {
    if (this.state && this.state.owner !== owner) {
      const other = this.state.owner;
      const choice = await vscode.window.showWarningMessage(
        `COM ${this.state.port} is used by WS63 ${label(other)}. Stop it and continue?`,
        { modal: true },
        "Stop & Continue",
        "Cancel"
      );
      if (choice !== "Stop & Continue") {
        return false;
      }
      await this.release(true);
    } else if (this.state && this.state.owner === owner && this.state.port !== port) {
      await this.release(true);
    }

    this.state = { owner, port, terminal };
    return true;
  }

  /** Soft acquire for flash: stop monitor/debug if needed. */
  async acquireForFlash(port: string): Promise<boolean> {
    return this.acquire("flash", port);
  }

  async release(disposeTerminal = false): Promise<void> {
    const cur = this.state;
    this.state = undefined;
    if (disposeTerminal && cur?.terminal) {
      try {
        cur.terminal.dispose();
      } catch {
        /* ignore */
      }
    }
  }

  bindTerminal(owner: PortOwner, terminal: vscode.Terminal): void {
    if (this.state?.owner === owner) {
      this.state.terminal = terminal;
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
