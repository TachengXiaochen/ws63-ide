/** Filters build output: stream important lines, throttle progress spam. */

import { parseXferLine, stripBackspaces, xferEtaHint } from "../output/sanitize";

export interface BuildProgress {
  current: number;
  total: number;
  percent: number;
  label: string;
}

export class BuildLogPresenter {
  private lastProgressPct = -1;
  private lastEmitted = "";

  parseProgress(line: string): BuildProgress | null {
    const m = line.match(/\[(\d+)\/(\d+)\]/);
    if (!m) {
      return null;
    }
    const current = parseInt(m[1], 10);
    const total = parseInt(m[2], 10);
    const percent = total > 0 ? Math.floor((100 * current) / total) : 0;
    const label = line.replace(/^\[[\d/]+\]\s*/, "").trim();
    return { current, total, percent, label: label || line.trim() };
  }

  shouldEmit(line: string): boolean {
    const trimmed = stripBackspaces(line).trim();
    if (!trimmed) {
      return false;
    }
    if (trimmed === this.lastEmitted) {
      return false;
    }

    if (/error:|warning:|fatal error|FAILED|cannot find|undefined reference/i.test(trimmed)) {
      this.lastEmitted = trimmed;
      return true;
    }

    if (
      /packet success|Build complete|cmake|ninja|Generating|Linking|Compiling/i.test(trimmed) &&
      !/Building C object.*\.o$/i.test(trimmed)
    ) {
      this.lastEmitted = trimmed;
      return true;
    }

    const prog = this.parseProgress(trimmed);
    if (prog) {
      if (prog.percent >= this.lastProgressPct + 10 || prog.percent === 100 || prog.current === 1) {
        this.lastProgressPct = prog.percent;
        this.lastEmitted = trimmed;
        return true;
      }
      return false;
    }

    if (/Building C object|Building CXX object|Scanning|Performing build step/i.test(trimmed)) {
      return false;
    }

    if (trimmed.length < 120 && !trimmed.startsWith("cd ")) {
      this.lastEmitted = trimmed;
      return true;
    }

    return false;
  }
}

export interface FlashLineResult {
  /** Line to show in output panel (null = skip). */
  display: string | null;
  /** Xfer progress for status bar. */
  xfer: ReturnType<typeof parseXferLine>;
  /** One-time hint for large files. */
  etaHint: string | null;
}

export class FlashLogPresenter {
  private sawWaiting = false;
  private lastLine = "";
  private lastXferFile = "";
  private lastXferPct = -1;
  private hintedFiles = new Set<string>();

  processLine(raw: string): FlashLineResult {
    const cleaned = stripBackspaces(raw).trim();
    if (!cleaned) {
      return { display: null, xfer: null, etaHint: null };
    }

    const xfer = parseXferLine(cleaned);
    if (xfer) {
      let etaHint: string | null = null;
      if (xfer.file !== this.lastXferFile) {
        this.lastXferFile = xfer.file;
        this.lastXferPct = -1;
        if (!this.hintedFiles.has(xfer.file)) {
          etaHint = xferEtaHint(xfer.file, xfer.meta);
          if (etaHint) {
            this.hintedFiles.add(xfer.file);
          }
        }
        return {
          display: `→ 传输 ${xfer.file} (${xfer.meta})`,
          xfer,
          etaHint,
        };
      }
      if (xfer.percent >= this.lastXferPct + 20 || xfer.percent === 100) {
        this.lastXferPct = xfer.percent;
        return {
          display: `→ 传输 ${xfer.file} ${xfer.percent}%`,
          xfer,
          etaHint: null,
        };
      }
      return { display: null, xfer, etaHint: null };
    }

    if (/Waiting for device reset/i.test(cleaned)) {
      if (this.sawWaiting) {
        return { display: null, xfer: null, etaHint: null };
      }
      this.sawWaiting = true;
      return { display: cleaned, xfer: null, etaHint: null };
    }

    if (cleaned === this.lastLine) {
      return { display: null, xfer: null, etaHint: null };
    }
    this.lastLine = cleaned;
    return { display: cleaned, xfer: null, etaHint: null };
  }

  shouldEmit(line: string): boolean {
    return this.processLine(line).display !== null;
  }

  isWaitingForReset(line: string): boolean {
    return /Waiting for device reset/i.test(stripBackspaces(line));
  }

  isTimeout(line: string): boolean {
    return /Connection timed out|timed out/i.test(stripBackspaces(line));
  }
}
