import * as vscode from "vscode";

const TOAST_AUTO_MS = 5000;

/** Brief toast with manual dismiss; also auto-hides via status bar. */
export function showFlashToast(
  message: string,
  kind: "success" | "warn" | "error" = "success"
): void {
  const show =
    kind === "error"
      ? vscode.window.showErrorMessage
      : kind === "warn"
        ? vscode.window.showWarningMessage
        : vscode.window.showInformationMessage;

  void show(message, "关闭");
  vscode.window.setStatusBarMessage(
    kind === "success" ? `$(check) ${message}` : `$(warning) ${message}`,
    TOAST_AUTO_MS
  );
}
