/** Strip terminal backspace overwrites (ws63flash progress uses \\b). */
export function stripBackspaces(raw: string): string {
  const chars: string[] = [];
  for (const ch of raw) {
    if (ch === "\b") {
      chars.pop();
    } else if (ch !== "\r") {
      chars.push(ch);
    }
  }
  return chars.join("");
}

export interface XferProgress {
  file: string;
  meta: string;
  percent: number;
}

/** Parse cleaned ws63flash Xfer line. */
export function parseXferLine(cleaned: string): XferProgress | null {
  const m = cleaned.match(/^Xfer\s+(\S+)\s+\(([^)]+)\)\s*(\d+)%/);
  if (!m) {
    return null;
  }
  return {
    file: m[1],
    meta: m[2],
    percent: parseInt(m[3], 10),
  };
}

/** Human-readable size hint for large bins. */
export function xferEtaHint(file: string, meta: string): string | null {
  if (!/liteos-app|sign\.bin/i.test(file)) {
    return null;
  }
  const sizeMatch = meta.match(/0x([0-9a-f]+)\s*B/i);
  if (!sizeMatch) {
    return "大文件传输中，请耐心等待 30–90 秒…";
  }
  const bytes = parseInt(sizeMatch[1], 16);
  if (bytes > 512 * 1024) {
    return `大文件 ${file} (${Math.round(bytes / 1024)} KB)，传输约 30–90 秒…`;
  }
  return null;
}
