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
 

  vnuExecutable = config.inspect<string>("vnuExecutable")?.globalValue || "";

  console.log("vnuExecutable path:", vnuExecutable);

  if (!vnuExecutable) {
    console.log(
      "No vnuExecutable path found in settings. Determining default path based on OS."
    );
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

    // Update the configuration with the determined vnuExecutable path
    await config.update(
      "vnuExecutable",
      vnuExecutable,
      vscode.ConfigurationTarget.Global
    );
  }

  // Create the status bar item
  statusBarItem = vscode.window.createStatusBarItem(
    vscode.StatusBarAlignment.Left,
    -100
  );
  statusBarItem.command = "htmlValidator.toggleValidation";
  context.subscriptions.push(statusBarItem);

  // Set initial status bar item state
  updateStatusBarItem();

  // Register the toggle validation command
  const toggleValidationCommand = vscode.commands.registerCommand(
    "htmlValidator.toggleValidation",
    () => {
      isValidationEnabled = !isValidationEnabled;
      updateStatusBarItem();
      context.globalState.update(
        "htmlValidator.isValidationEnabled",
        isValidationEnabled
      );

      if (!isValidationEnabled) {
        // Clear diagnostics if validation is disabled
        diagnosticCollection.clear();
      } else {
        // Re-validate the active document if validation is enabled
        if (vscode.window.activeTextEditor) {
          const document = vscode.window.activeTextEditor.document;
          if (document.languageId === "html") {
            validate(document, diagnosticCollection);
          }
        }
      }
    }
  );
  context.subscriptions.push(toggleValidationCommand);

  // Validate the active editor's document if it's an HTML file
  if (vscode.window.activeTextEditor) {
    const document = vscode.window.activeTextEditor.document;
    if (document.languageId === "html") {
      validate(document, diagnosticCollection);
    }
  }

  // Listen to document save events
  context.subscriptions.push(
    vscode.workspace.onDidSaveTextDocument((document) => {
      if (document.languageId === "html") {
        validate(document, diagnosticCollection);
      }
    })
  );

  // Clean up diagnostics when a document is closed
  context.subscriptions.push(
    vscode.workspace.onDidCloseTextDocument((document) => {
      diagnosticCollection.delete(document.uri);
    })
  );

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

  statusBarItem = vscode.window.createStatusBarItem(
    vscode.StatusBarAlignment.Left,
    -100
  );
  statusBarItem.command = "htmlValidator.toggleValidation";
  _context.subscriptions.push(statusBarItem);

  statusBarItem.text = `$(check) HTML Validator`;
  if (isValidationEnabled) {
    statusBarItem.tooltip = "Click to disable HTML validation on save";
    statusBarItem.backgroundColor = hasErrors
      ? new vscode.ThemeColor("statusBarItem.errorBackground")
      : hasWarnings
      ? new vscode.ThemeColor("statusBarItem.warningBackground")
      : undefined;
    statusBarItem.color = hasErrors
      ? new vscode.ThemeColor("statusBarItem.errorForeground")
      : hasWarnings
      ? new vscode.ThemeColor("statusBarItem.warningForeground")
      : undefined;
  } else {
    statusBarItem.text = `$(x) HTML Validator (Disabled)`;
    statusBarItem.tooltip = "Click to enable HTML validation on save";
    statusBarItem.color = new vscode.ThemeColor(
      "statusBarItem.inactiveForeground"
    );
    statusBarItem.backgroundColor = new vscode.ThemeColor(
      "statusBarItem.inactiveBackground"
    );
    statusBarItem.color = undefined;
  }
  statusBarItem.show();
}

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
  type: "info" | "warning" | "error"
) {


  // Add an emoji or icon based on the type
  let icon = "";
  switch (type) {
    case "info":
      icon = "ℹ️"; // Information icon
      break;
    case "warning":
      icon = "⚠️"; // Warning icon
      break;
    case "error":
      icon = "❌"; // Error icon
      break;
  }

  const fullMessage = `${message} ${icon}${icon}`;

  vscode.window.withProgress(
    {
      location: vscode.ProgressLocation.Notification,
      title: fullMessage,
      cancellable: false,
    },
    async () => {
      await new Promise((resolve) => setTimeout(resolve, timeout));
    }
  );
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
    vscode.window.showErrorMessage(
      "vnu executable not found. Expected path: " + vnuExecutable
    );
    return;
  }

  const filePath = document.uri.fsPath;
  const args = ["--format", "json", "--exit-zero-always", filePath];

  const outputChannel = vscode.window.createOutputChannel("HTML Validator");
  outputChannel.clear();

  const process = child_process.spawn(vnuExecutable, args, { shell: true });

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

    const diagnostics: vscode.Diagnostic[] = [];

    try {
      const result = JSON.parse(stderr);
      let severeCount = 0;
      let warningCount = 0;
      for (const message of result.messages) {
        const line = Math.max(0, message.lastLine - 1);
        const col = Math.max(0, message.lastColumn - 1);
        const range = new vscode.Range(line, col, line, col);
        const severity =
          message.type === "error"
            ? vscode.DiagnosticSeverity.Error
            : vscode.DiagnosticSeverity.Warning;
        if (severity === vscode.DiagnosticSeverity.Error) {
          severeCount++;
        } else {
          warningCount++;
        }
        const diagnostic = new vscode.Diagnostic(
          range,
          message.message,
          severity
        );
        diagnostics.push(diagnostic);
      }
      if (severeCount > 0) {
        hasErrors = true;
        hasWarnings = false;
        showTimedMessage(
          "One or more ERRORS found, please fix.",
          2000,
          "error"
        );
  // Fetch configuration values
  const config = vscode.workspace.getConfiguration('htmlValidator');
  const autoOpenProblems = config.get<boolean>('autoOpenProblems', true);
        if (autoOpenProblems) {
          vscode.commands.executeCommand("workbench.actions.view.problems");
        }
      } else if (warningCount > 0) {
        hasErrors = false;
        hasWarnings = true;
        showTimedMessage("One or more warnings found.", 2000, "warning");
      } else {
        hasErrors = false;
        hasWarnings = false;
        showTimedMessage("Everything is fine", 2000, "info");
      }
    } catch (e) {
      if (e instanceof Error) {
        vscode.window.showErrorMessage(
          "Failed to parse validator output: " + e.message
        );
        outputChannel.appendLine(
          "Failed to parse validator output: " + e.message
        );
      } else {
        vscode.window.showErrorMessage(
          "Failed to parse validator output: Unknown error"
        );
        outputChannel.appendLine(
          "Failed to parse validator output: Unknown error"
        );
      }
      outputChannel.appendLine("Validator Output: " + stderr);
      return;
    }

    diagnosticCollection.set(document.uri, diagnostics);
    updateStatusBarItem();
  });
}
