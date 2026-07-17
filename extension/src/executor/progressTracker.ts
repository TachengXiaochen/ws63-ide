/** Track overall flash progress weighted by bin file size. */

export interface FlashBin {
  name: string;
  bytes: number;
}

export class FlashProgressTracker {
  readonly bins: FlashBin[] = [];
  private currentFile = "";
  private currentPct = 0;
  private stage = "准备烧录";

  /** Parse fwpkg table row: |*|name.bin |0xSIZE| */
  parseBinRow(line: string): void {
    const m = line.match(/\|[!*]\|(\S+)\s+\|(0x[0-9a-f]+)\|/i);
    if (m && !this.bins.some((b) => b.name === m[1])) {
      this.bins.push({ name: m[1], bytes: parseInt(m[2], 16) });
    }
  }

  setStage(stage: string): void {
    this.stage = stage;
  }

  onXfer(file: string, percent: number): void {
    this.currentFile = file;
    this.currentPct = percent;
    this.stage = `传输 ${file}`;
  }

  get totalBytes(): number {
    return this.bins.reduce((s, b) => s + b.bytes, 0) || 1;
  }

  private forcedOverall: number | null = null;

  forceComplete(stage = "烧录完成"): void {
    this.forcedOverall = 100;
    this.currentPct = 100;
    this.stage = stage;
    if (this.bins.length) {
      this.currentFile = this.bins[this.bins.length - 1].name;
    }
  }

  /** Overall 0–100 based on bytes transferred. */
  get overall(): number {
    if (this.forcedOverall !== null) {
      return this.forcedOverall;
    }
    if (!this.bins.length) {
      return 0;
    }
    let done = 0;
    for (const bin of this.bins) {
      if (bin.name === this.currentFile) {
        done += bin.bytes * (this.currentPct / 100);
        break;
      }
      done += bin.bytes;
    }
    return Math.min(100, Math.round((done / this.totalBytes) * 100));
  }

  get detail(): string {
    if (!this.currentFile) {
      return this.stage;
    }
    const bin = this.bins.find((b) => b.name === this.currentFile);
    const kb = bin ? Math.round(bin.bytes / 1024) : 0;
    return `${this.currentFile} · ${this.currentPct}% · ${kb} KB`;
  }

  get snapshot(): FlashSnapshot {
    const idx = this.bins.findIndex((b) => b.name === this.currentFile);
    return {
      overall: this.overall,
      stage: this.stage,
      detail: this.detail,
      currentFile: this.currentFile,
      currentPct: this.currentPct,
      fileIndex: idx >= 0 ? idx + 1 : 0,
      fileTotal: this.bins.length,
      bins: this.bins.map((b, i) => ({
        name: b.name,
        done: this.forcedOverall === 100 || (idx >= 0 && i < idx) || (b.name === this.currentFile && this.currentPct >= 100),
        active: this.forcedOverall !== 100 && b.name === this.currentFile && this.currentPct < 100,
      })),
    };
  }
}

export interface FlashSnapshot {
  overall: number;
  stage: string;
  detail: string;
  currentFile: string;
  currentPct: number;
  fileIndex: number;
  fileTotal: number;
  bins: { name: string; done: boolean; active: boolean }[];
}

export class BuildProgressTracker {
  private lastOverall = 0;
  private stage = "编译中";

  onNinja(current: number, total: number, label: string): number {
    this.stage = label || `编译 ${current}/${total}`;
    return total > 0 ? Math.round((100 * current) / total) : 0;
  }

  get stageText(): string {
    return this.stage;
  }

  /** Increment since last report (for VS Code progress API). */
  delta(overall: number): number {
    const d = overall - this.lastOverall;
    this.lastOverall = overall;
    return Math.max(0, d);
  }

  reset(): void {
    this.lastOverall = 0;
    this.stage = "编译中";
  }
}
