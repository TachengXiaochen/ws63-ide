export type LogLevel = "error" | "warn" | "info" | "debug";

const TAG: Record<LogLevel, string> = {
  error: "✖ ERR",
  warn: "⚠ WRN",
  info: "● INF",
  debug: "  DBG",
};

export function formatLog(level: LogLevel, message: string): string {
  return `[${TAG[level]}] ${message}`;
}

export function classifyBuildLine(line: string, stream: "stdout" | "stderr"): LogLevel {
  const t = line.trim();
  if (!t) {
    return "debug";
  }
  if (/error:|fatal error|FAILED|undefined reference|cannot find|✖/i.test(t)) {
    return "error";
  }
  if (/warning:|WARN/i.test(t) || stream === "stderr") {
    return "warn";
  }
  if (/packet success|Build complete|succeeded|Linking CXX|Linking C/i.test(t)) {
    return "info";
  }
  if (/^\[\d+\/\d+\]/.test(t)) {
    return "debug";
  }
  if (/Building C object|Building CXX object|Scanning dependencies/i.test(t)) {
    return "debug";
  }
  if (/cmake|ninja|Compiling|Generating|Installing/i.test(t)) {
    return "info";
  }
  return "info";
}

export function classifyFlashLine(line: string, stream: "stdout" | "stderr"): LogLevel {
  const t = line.trim();
  if (!t) {
    return "debug";
  }
  if (
    /error|failed|timed out|timeout|PermissionError|Connection refused|No such device|open:/i.test(t)
  ) {
    return "error";
  }
  if (
    /Waiting for device reset|^>>>|RST|请按|===.*Flash|stopping|hint:/i.test(t) ||
    /^=+$/.test(t)
  ) {
    return "warn";
  }
  if (/^\||BIN NAME|^\+-|^\*|\|!|\|\*|Burning|Writing|packet success/i.test(t)) {
    return "info";
  }
  if (/\[flash\] command/i.test(t)) {
    return "debug";
  }
  if (/\[flash\]/i.test(t)) {
    return "warn";
  }
  if (stream === "stderr") {
    return "warn";
  }
  return "info";
}
