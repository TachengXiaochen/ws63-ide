import * as path from "path";
import * as vscode from "vscode";

const collection = vscode.languages.createDiagnosticCollection("ws63");

const GCC_FULL =
  /^(.+?):(\d+):(\d+):\s+(fatal error|error|warning|note):\s+(.*)$/i;
const GCC_LINE = /^(.+?):(\d+):\s+(fatal error|error|warning|note):\s+(.*)$/i;

function severityOf(kind: string): vscode.DiagnosticSeverity {
  const k = kind.toLowerCase();
  if (k.includes("error")) {
    return vscode.DiagnosticSeverity.Error;
  }
  if (k.includes("warning")) {
    return vscode.DiagnosticSeverity.Warning;
  }
  return vscode.DiagnosticSeverity.Information;
}

function resolveUri(file: string, sdkPath: string): vscode.Uri | undefined {
  if (!file || file === "<stdin>") {
    return undefined;
  }
  if (file.startsWith("/") || /^[A-Za-z]:/.test(file)) {
    return vscode.Uri.file(file);
  }
  return vscode.Uri.file(path.join(sdkPath, file));
}

/** Parse gcc/ninja-style lines into Problems panel diagnostics. */
export function publishBuildDiagnostics(
  text: string,
  sdkPath: string
): number {
  collection.clear();
  const byFile = new Map<string, vscode.Diagnostic[]>();

  for (const raw of text.split(/\r?\n/)) {
    const line = raw.trim();
    let file = "";
    let lineNo = 0;
    let col = 1;
    let kind = "error";
    let message = "";

    let m = line.match(GCC_FULL);
    if (m) {
      [, file, , , kind, message] = m;
      lineNo = parseInt(m[2], 10);
      col = parseInt(m[3], 10);
    } else {
      m = line.match(GCC_LINE);
      if (!m) {
        continue;
      }
      [, file, , kind, message] = m;
      lineNo = parseInt(m[2], 10);
    }

    const uri = resolveUri(file, sdkPath);
    if (!uri || !lineNo) {
      continue;
    }
    const range = new vscode.Range(
      Math.max(0, lineNo - 1),
      Math.max(0, col - 1),
      Math.max(0, lineNo - 1),
      Math.max(0, col - 1) + 80
    );
    const diag = new vscode.Diagnostic(range, message, severityOf(kind));
    diag.source = "ws63";
    const key = uri.toString();
    const list = byFile.get(key) || [];
    list.push(diag);
    byFile.set(key, list);
  }

  for (const [key, diags] of byFile) {
    collection.set(vscode.Uri.parse(key), diags);
  }
  return [...byFile.values()].reduce((n, d) => n + d.length, 0);
}

export function clearBuildDiagnostics(): void {
  collection.clear();
}

export function registerBuildDiagnostics(context: vscode.ExtensionContext): void {
  context.subscriptions.push(collection);
}
