// src/extension.ts
import * as vscode from "vscode";
import * as child_process from "child_process";
import * as path from "path";
import * as fs from "fs";
import * as os from "os";

let vnuExecutable: string;
let isValidationEnabled = true;
let statusBarItem: vscode.StatusBarItem;
let hasErrors = false;
let hasWarnings = false;
let _context: vscode.ExtensionContext;



let hasValidated = false; // Track if validation has been run
let globalErrorCount = 0;
let globalWarningCount = 0;


export async function activate(context: vscode.ExtensionContext) {
  console.log("Activating HTML Validator extension");
  _context = context;
  // Create diagnostic collection
  const diagnosticCollection =
    vscode.languages.createDiagnosticCollection("html-validator");
  context.subscriptions.push(diagnosticCollection);

  // Get validation enabled state from global state
  isValidationEnabled = context.globalState.get<boolean>(
    "htmlValidator.isValidationEnabled",
    true
  );

  // Get the vnuExecutable path from configuration
  const config = vscode.workspace.getConfiguration("htmlValidator");


  // vnuExecutable = config.inspect<string>("vnuExecutable")?.globalValue || "";

  // console.log("vnuExecutable path:", vnuExecutable);

  // if (!vnuExecutable) {
  //   console.log(
  //     "No vnuExecutable path found in settings. Determining default path based on OS."
  //   );
  let extensionPath = context.extensionPath;

  if (os.platform() === "win32") {
    // On Windows, remove leading slash if present
    extensionPath = removeLeadingSlashOrBackslash(extensionPath);
  }

  if (!extensionPath) {
    vscode.window.showErrorMessage("Unable to determine the extension path.");
    return;
  }

  switch (os.platform()) {
    case "darwin": // macOS
      vnuExecutable = path.join(
        extensionPath,
        "validator",
        "vnu.osx",
        "vnu-runtime-image",
        "bin",
        "vnu"
      );
      break;
    case "win32": // Windows
      vnuExecutable = path.join(
        extensionPath,
        "validator",
        "vnu.windows",
        "vnu-runtime-image",
        "bin",
        "vnu.bat"
      );
      break;
    case "linux": // Linux
      vnuExecutable = path.join(
        extensionPath,
        "validator",
        "vnu.linux",
        "vnu-runtime-image",
        "bin",
        "vnu"
      );
      break;
    default:
      vscode.window.showErrorMessage("Unsupported OS platform.");
      return;
  }

  //   // Update the configuration with the determined vnuExecutable path
  //   await config.update(
  //     "vnuExecutable",
  //     vnuExecutable,
  //     vscode.ConfigurationTarget.Global
  //   );
  // }

  // Create the status bar item
  statusBarItem = vscode.window.createStatusBarItem(vscode.StatusBarAlignment.Left, -100);
  statusBarItem.command = "htmlValidator.toggleValidation";
  context.subscriptions.push(statusBarItem);
  // Set initial status bar item state
  updateStatusBarItem();
  // Register the toggle validation command
  const toggleValidationCommand = vscode.commands.registerCommand("htmlValidator.toggleValidation", () => {
    isValidationEnabled = !isValidationEnabled;
    updateStatusBarItem();
    context.globalState.update("htmlValidator.isValidationEnabled", isValidationEnabled);
    if (!isValidationEnabled) {
      // Clear diagnostics if validation is disabled
      diagnosticCollection.clear();
    }
    else {
      // Re-validate the active document if validation is enabled
      if (vscode.window.activeTextEditor) {
        const document = vscode.window.activeTextEditor.document;
        if (document.languageId === "html") {
          validate(document, diagnosticCollection);
        }
      }
    }
  });
  context.subscriptions.push(toggleValidationCommand);
  // Validate the active editor's document if it's an HTML file
  if (vscode.window.activeTextEditor) {
    const document = vscode.window.activeTextEditor.document;
    if (document.languageId === "html") {
      validate(document, diagnosticCollection);
    }
  }
  // Listen to document save events
  context.subscriptions.push(vscode.workspace.onDidSaveTextDocument((document) => {
    if (document.languageId === "html") {
      validate(document, diagnosticCollection);
    }
  }));
  // Listen to document changes to reset validation state
  context.subscriptions.push(vscode.workspace.onDidChangeTextDocument((event) => {
    // Only reset if:
    // 1. It's an HTML document
    // 2. Validation has been run before
    // 3. The change has actual content changes (not just save/format)
    if (event.document.languageId === "html" && hasValidated && event.contentChanges.length > 0) {
      // Check if this is a real edit (has actual text changes)
      const hasRealChanges = event.contentChanges.some(change => change.text.length > 0 || change.rangeLength > 0);
      if (hasRealChanges) {
        // Reset validation state when code changes
        hasValidated = false;
        hasErrors = false;
        hasWarnings = false;
        globalErrorCount = 0;
        globalWarningCount = 0;
        updateStatusBarItem();
      }
    }
  }));
  // Clean up diagnostics when a document is closed
  context.subscriptions.push(vscode.workspace.onDidCloseTextDocument((document) => {
    diagnosticCollection.delete(document.uri);
  }));
  console.log("HTML Validator extension activated");
}

export function deactivate() {
    if (statusBarItem) {
        statusBarItem.dispose();
    }
}

function updateStatusBarItem() {
  if (statusBarItem) {
    statusBarItem.hide();
    statusBarItem.dispose();
  }
  statusBarItem = vscode.window.createStatusBarItem(vscode.StatusBarAlignment.Left, -100);
  statusBarItem.command = "htmlValidator.toggleValidation";
  _context.subscriptions.push(statusBarItem);
  if (isValidationEnabled) {
    if (!hasValidated) {
      // Not checked yet - normal transparent background
      statusBarItem.text = `W3C`;
      statusBarItem.tooltip = "Click to disable W3C HTML validation on save";
      statusBarItem.backgroundColor = undefined;
      statusBarItem.color = undefined;
    }
    else if (hasErrors && globalErrorCount > 0) {
      // Errors found - red background with count
      statusBarItem.text = `W3C: ${globalErrorCount} error${globalErrorCount !== 1 ? 's' : ''}`;
      statusBarItem.tooltip = `W3C HTML Validator - ${globalErrorCount} validation error${globalErrorCount !== 1 ? 's' : ''} found`;
      statusBarItem.backgroundColor = new vscode.ThemeColor("statusBarItem.errorBackground");
      statusBarItem.color = new vscode.ThemeColor("statusBarItem.errorForeground");
    }
    else if (hasWarnings && globalWarningCount > 0) {
      // Warnings found - yellow background with count
      statusBarItem.text = `W3C: ${globalWarningCount} warning${globalWarningCount !== 1 ? 's' : ''}`;
      statusBarItem.tooltip = `W3C HTML Validator - ${globalWarningCount} validation warning${globalWarningCount !== 1 ? 's' : ''} found`;
      statusBarItem.backgroundColor = new vscode.ThemeColor("statusBarItem.warningBackground");
      statusBarItem.color = new vscode.ThemeColor("statusBarItem.warningForeground");
    }
    else if (hasValidated) {
      // Success case - green background
      statusBarItem.text = "W3C: OK";
      statusBarItem.tooltip = "W3C HTML Validator - No validation issues";
      statusBarItem.backgroundColor = new vscode.ThemeColor("testing.iconPassed"); // Green from VS Code theme
      statusBarItem.color = undefined; // Use default text color
    }
    else {
      // Fallback - should not reach here
      statusBarItem.text = `W3C`;
      statusBarItem.tooltip = "Click to disable W3C HTML validation on save";
      statusBarItem.backgroundColor = undefined;
      statusBarItem.color = undefined;
    }
  }
  else {
    statusBarItem.text = `W3C (Disabled)`;
    statusBarItem.tooltip = "Click to enable W3C HTML validation on save";
    statusBarItem.color = new vscode.ThemeColor("statusBarItem.inactiveForeground");
    statusBarItem.backgroundColor = new vscode.ThemeColor("statusBarItem.inactiveBackground");
    statusBarItem.color = undefined;
  }
  statusBarItem.show();
}

// function updateStatusBarItem() {
//   if (statusBarItem) {
//     statusBarItem.hide();
//     statusBarItem.dispose();
//   }

//   statusBarItem = vscode.window.createStatusBarItem(
//     vscode.StatusBarAlignment.Left,
//     -100
//   );
//   statusBarItem.command = "htmlValidator.toggleValidation";
//   _context.subscriptions.push(statusBarItem);

//   statusBarItem.text = `$(check) HTML Validator`;
//   if (isValidationEnabled) {
//     statusBarItem.tooltip = "Click to disable HTML validation on save";
//     statusBarItem.backgroundColor = hasErrors
//       ? new vscode.ThemeColor("statusBarItem.errorBackground")
//       : hasWarnings
//       ? new vscode.ThemeColor("statusBarItem.warningBackground")
//       : undefined;
//     statusBarItem.color = hasErrors
//       ? new vscode.ThemeColor("statusBarItem.errorForeground")
//       : hasWarnings
//       ? new vscode.ThemeColor("statusBarItem.warningForeground")
//       : undefined;
//   } else {
//     statusBarItem.text = `$(x) HTML Validator (Disabled)`;
//     statusBarItem.tooltip = "Click to enable HTML validation on save";
//     statusBarItem.color = new vscode.ThemeColor(
//       "statusBarItem.inactiveForeground"
//     );
//     statusBarItem.backgroundColor = new vscode.ThemeColor(
//       "statusBarItem.inactiveBackground"
//     );
//     statusBarItem.color = undefined;
//   }
//   statusBarItem.show();
// }

function removeLeadingSlashOrBackslash(str: string) {
  if (!str) {
    return "";
  }
  if (str.startsWith("\\") || str.startsWith("/")) {
    return str.substring(1);
  }
  return str;
}

async function showTimedMessage(
  message: string,
  timeout: number,
  type: "info" | "warning" | "error",
  count: number
) {
        // Store the original status bar text
        const originalText = statusBarItem.text;
        const originalTooltip = statusBarItem.tooltip;
        const originalColor = statusBarItem.color;
        const originalBackgroundColor = statusBarItem.backgroundColor;
        // Update status bar with W3C prefix
        let statusText = "W3C";
        let tooltipText = "W3C HTML Validator";
        if (type === "error") {
            statusText = `W3C: ${count || 1} error${count !== 1 ? 's' : ''}`;
            tooltipText = `W3C HTML Validator - ${count || 1} validation error${count !== 1 ? 's' : ''} found`;
            statusBarItem.backgroundColor = new vscode.ThemeColor("statusBarItem.errorBackground");
            statusBarItem.color = new vscode.ThemeColor("statusBarItem.errorForeground");
        }
        else if (type === "warning") {
            statusText = `W3C: ${count || 1} warning${count !== 1 ? 's' : ''}`;
            tooltipText = `W3C HTML Validator - ${count || 1} validation warning${count !== 1 ? 's' : ''} found`;
            statusBarItem.backgroundColor = new vscode.ThemeColor("statusBarItem.warningBackground");
            statusBarItem.color = new vscode.ThemeColor("statusBarItem.warningForeground");
        }
        else {
            statusText = "W3C: OK";
            tooltipText = "W3C HTML Validator - No validation issues";
            // Use explicit green color for success
            statusBarItem.backgroundColor = "#28a745"; // Explicit green color
            statusBarItem.color = "#ffffff"; // White text for contrast
        }
        // Update status bar
        statusBarItem.text = statusText;
        statusBarItem.tooltip = tooltipText;
        // // Restore original status bar after timeout
        // setTimeout(() => {
        //   statusBarItem.text = originalText;
        //   statusBarItem.tooltip = originalTooltip;
        //   statusBarItem.color = originalColor;
        //   statusBarItem.backgroundColor = originalBackgroundColor;
        //   // Don't call updateStatusBarItem() here as it resets the colors
        // }, timeout);
}

function validate(
  document: vscode.TextDocument,
  diagnosticCollection: vscode.DiagnosticCollection
): void {
  if (!isValidationEnabled) {
        return;
    }
    console.log("Validating document:", document.uri.fsPath);
    // Check if vnuExecutable exists
    if (!vnuExecutable || !fs.existsSync(vnuExecutable)) {
        vscode.window.showErrorMessage("vnu executable not found. Expected path: " + vnuExecutable);
        return;
    }
    const quotedVnuExecutable = `"${vnuExecutable}"`;
    const filePath = document.uri.fsPath;
    const config = vscode.workspace.getConfiguration("htmlValidator");
    const noStream = config.get("noStream", true);
    const noLangDetect = config.get("noLangDetect", true);
    console.log({ noStream, noLangDetect });
    // Quote paths to handle spaces safely on Windows
    const quotedFilePath = `"${filePath}"`;
    const args = ["--format", "json", "--exit-zero-always", noStream ? '--no-stream' : '', noLangDetect ? '--no-langdetect' : '', noStream ? '--no-stream' : '', quotedFilePath];
    const outputChannel = vscode.window.createOutputChannel("HTML Validator");
    outputChannel.clear();
    // --no-stream
    // Quote the vnu executable path for safe command execution
    console.log(quotedVnuExecutable, args, { shell: true })
    const process = child_process.spawn(quotedVnuExecutable, args, { shell: true });
    let stdout = "";
    let stderr = "";
    process.stdout.on("data", (data) => {
        stdout += data.toString();
    });
    process.stderr.on("data", (data) => {
        stderr += data.toString();
    });
    process.on("close", (code) => {
        console.log("Validator process exited with code:", code);
        console.log("stdout:", stdout);
        console.log("stderr:", stderr);
        const diagnostics = [];
        try {
            const result = JSON.parse(stderr);
            let severeCount = 0;
            let warningCount = 0;
            for (const message of result.messages) {
                const line = Math.max(0, message.lastLine - 1);
                const col = Math.max(0, message.lastColumn - 1);
                const range = new vscode.Range(line, col, line, col);
                const severity = message.type === "error"
                    ? vscode.DiagnosticSeverity.Error
                    : vscode.DiagnosticSeverity.Warning;
                if (severity === vscode.DiagnosticSeverity.Error) {
                    severeCount++;
                }
                else {
                    warningCount++;
                }
                const diagnostic = new vscode.Diagnostic(range, message.message, severity);
                diagnostics.push(diagnostic);
            }
            if (severeCount > 0) {
                hasErrors = true;
                hasWarnings = false;
                hasValidated = true;
                globalErrorCount = severeCount;
                globalWarningCount = 0;
                // Fetch configuration values
                const autoOpenProblems = config.get("autoOpenProblems", false);
                if (autoOpenProblems) {
                    // Note: This may still steal focus, so it's disabled by default
                    vscode.commands.executeCommand("workbench.actions.view.problems");
                }
            }
            else if (warningCount > 0) {
                hasErrors = false;
                hasWarnings = true;
                hasValidated = true;
                globalErrorCount = 0;
                globalWarningCount = warningCount; // Store the local warningCount in global variable
            }
            else {
                hasErrors = false;
                hasWarnings = false;
                hasValidated = true;
                globalErrorCount = 0;
                globalWarningCount = 0;
            }
        }
        catch (e) {
            if (e instanceof Error) {
                vscode.window.showErrorMessage("Failed to parse validator output: " + e.message);
                outputChannel.appendLine("Failed to parse validator output: " + e.message);
            }
            else {
                vscode.window.showErrorMessage("Failed to parse validator output: Unknown error");
                outputChannel.appendLine("Failed to parse validator output: Unknown error");
            }
            outputChannel.appendLine("Validator Output: " + stderr);
            return;
        }
        diagnosticCollection.set(document.uri, diagnostics);
        // Update status bar to show current validation state
        updateStatusBarItem();
    });
}
