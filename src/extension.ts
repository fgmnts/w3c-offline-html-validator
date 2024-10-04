// src/extension.ts
import * as vscode from "vscode";
import * as child_process from "child_process";
import * as path from "path";
import * as fs from "fs";
import * as os from "os";
import * as https from "https";

// let vnuJarPath: string | null = null;

// Detect the OS
let vnuExecutable: string;

let isValidationEnabled = true;
let statusBarItem: vscode.StatusBarItem;
let hasErrors = false;

function showTimedInfoMessage(message: string, duration: number) {
  const infoMessage = vscode.window.showInformationMessage(message);

  // // Set timeout to automatically close the message after 'duration' milliseconds
  // setTimeout(() => {
  //     infoMessage.then(item => {
  //         if (!item) {
  //             vscode.commands.executeCommand('workbench.action.closeMessages');
  //         }
  //     });
  // }, duration);
}

// function updateStatusBarItem() {
//   statusBarItem.text = `$(check) HTML Validator`;
//   statusBarItem.tooltip = isValidationEnabled ? 'Disable HTML Validation' : 'Enable HTML Validation';
//   statusBarItem.command = 'htmlValidator.toggleValidation';
//   statusBarItem.color = hasErrors ? new vscode.ThemeColor('errorForeground') : undefined;
//   statusBarItem.show();

//   // Adjust opacity based on validation state
//   statusBarItem.text = isValidationEnabled ? `$(check) HTML Validator` : `$(x) HTML Validator`;
//   statusBarItem.opacity = isValidationEnabled ? 1 : 0.5;
// }

function updateStatusBarItem() {
  if (isValidationEnabled) {
    statusBarItem.text = `$(check) HTML Validator`;
    statusBarItem.tooltip = "Click to disable HTML validation on save";
    statusBarItem.color = hasErrors
      ? new vscode.ThemeColor("statusBarItem.errorForeground")
      : undefined;
    statusBarItem.backgroundColor = undefined;
  } else {
    statusBarItem.text = `$(x) HTML Validator (Disabled)`;
    statusBarItem.tooltip = "Click to enable HTML validation on save";
    statusBarItem.color = new vscode.ThemeColor(
      "statusBarItem.inactiveForeground"
    );
    statusBarItem.backgroundColor = new vscode.ThemeColor(
      "statusBarItem.inactiveBackground"
    );
  }
  statusBarItem.show();
}

export async function activate(context: vscode.ExtensionContext) {
  console.log("activate activate activate");
  const diagnosticCollection =
    vscode.languages.createDiagnosticCollection("html-validator");
  context.subscriptions.push(diagnosticCollection);
  isValidationEnabled = context.globalState.get<boolean>(
    "htmlValidator.isValidationEnabled",
    true
  );

  const config = vscode.workspace.getConfiguration("htmlValidator");
  vnuExecutable = config.inspect<string>('vnuExecutable')?.globalValue || '';
 //  config.get<string>("vnuExecutable", "");
  console.log({ vnuExecutable });
  if (!vnuExecutable) {
    console.log(">> no path");
    // // The setting is unset or empty
    // const desiredPath = '/path/to/your/vnu.jar'; // Replace this with your actual path

    let extensionPath = context.extensionUri.path;

    // const normalizedPath = path.normalize(extensionPath); // This will normalize the path for the current platform

    // let extPath = extensionPath; //path.normalize(extensionPath);

    console.log(">> Extension folder path:", extensionPath);

    if (os.platform() === "win32") {
      // Windows
      extensionPath = removeLeadingSlashOrBackslash(extensionPath);
    }

    if (!extensionPath) {
      vscode.window.showErrorMessage("Unsupported base path.");
    }

    switch (os.platform()) {
      case "darwin": // macOS
        vnuExecutable = path.join(
          `${extensionPath}`,
          "validator",
          "vnu.osx",
          "vnu-runtime-image",
          "bin",
          "vnu"
        );
        break;
      case "win32": // Windows
        vnuExecutable = path.join(
          `${extensionPath}`,
          "validator",
          "vnu.windows",
          "vnu-runtime-image",
          "bin",
          "vnu.bat"
        );
        break;
      case "linux": // Linux
        vnuExecutable = path.join(
          `${extensionPath}`,
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

    await config.update(
      "vnuExecutable",
      vnuExecutable,
      vscode.ConfigurationTarget.Global
    );
    // vnuJarPath = extensionPath!;
  }

  statusBarItem = vscode.window.createStatusBarItem(
    vscode.StatusBarAlignment.Left,
    -100
  );
  statusBarItem.command = "htmlValidator.toggleValidation";
  context.subscriptions.push(statusBarItem);

  // Set initial status bar item state
  updateStatusBarItem();

  const toggleValidationCommand = vscode.commands.registerCommand(
    "htmlValidator.toggleValidation",
    () => {
      isValidationEnabled = !isValidationEnabled;
      updateStatusBarItem();
      context.globalState.update(
        "htmlValidator.isValidationEnabled",
        isValidationEnabled
      );

      // Clear diagnostics if validation is disabled
      if (!isValidationEnabled) {
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
}

export function deactivate() {
  if (statusBarItem) {
    statusBarItem.dispose();
  }
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

function validate(
  document: vscode.TextDocument,
  diagnosticCollection: vscode.DiagnosticCollection
): void {
  if (!isValidationEnabled) {
    return;
  }
  console.log("validate validate validate");
  const config = vscode.workspace.getConfiguration("htmlValidator");
  // let vnuJarPath = config.get<string>("vnuJarPath") || "";
  ///home/pibeeckm/Documents/
  let message;
  if (vscode.workspace.workspaceFolders !== undefined) {
    let wf = vscode.workspace.workspaceFolders[0].uri.path;
    let f = vscode.workspace.workspaceFolders[0].uri.fsPath;

    message = `YOUR-EXTENSION: folder: ${wf} - ${f}`;

    // vscode.window.showInformationMessage(message);
  } else {
    message =
      "YOUR-EXTENSION: Working folder not found, open a folder an try again";

    // vscode.window.showErrorMessage(message);
  }

  // const p = vscode.extensions.getExtension(
  //   "undefined_publisher.w3c-offline-html-validator"
  // )?.extensionUri.path;

  console.log("debug ext", { vnuExecutable });
  // console.log("debug ext", { message });
  // console.log("debug ext", { vnuJarPath });

  // // Resolve the path if it contains workspace folder variable
  // if (vnuJarPath.includes("${workspaceFolder}") && extPath) {
  //   // const workspaceFolder = vscode.workspace.workspaceFolders ? vscode.workspace.workspaceFolders[0].uri.fsPath : '';
  //   vnuJarPath = vnuJarPath.replace("${workspaceFolder}", extPath);
  // }

  // console.log("debug ext", { vnuJarPath });

  const filePath = document.uri.fsPath;
  // Check if vnu.jar exists synchronously
  if (!vnuExecutable || !fs.existsSync(vnuExecutable)) {
    vscode.window.showErrorMessage(
      "vnu not found. Current path should be: " + vnuExecutable
    );
    return;
  }
  // Command arguments
  const args = ["--format", "json", "--exit-zero-always", filePath];

  // const javaExecutable = "java";
  // const args = [
  //   "-jar",
  //   vnuJarPath,
  //   "--format",
  //   "json",
  //   "--exit-zero-always",
  //   filePath,
  // ];

  const outputChannel = vscode.window.createOutputChannel("HTML Validator");
  outputChannel.clear();
  // outputChannel.show(); // Uncomment if you want the Output channel to be visible

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
    console.log(">>", { code, stdout, stderr });
    if (code !== 0 && stderr) {
      vscode.window.showErrorMessage("Error running vnu.jar: " + stderr);
      outputChannel.appendLine("Error running vnu.jar: " + stderr);
      return;
    }

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
        vscode.window
          .showErrorMessage(
            "1 or more ERRORS found, please fix ⚠️",
            "Go to Problems"
          )
          .then((selection) => {
            if (selection === "Go to Problems") {
              vscode.commands.executeCommand("workbench.actions.view.problems");
            }
          });
        // vscode.window.showErrorMessage("1 or more ERRORS found, please fix");
      } else if (warningCount > 0) {
        hasErrors = false;
        vscode.window.showWarningMessage("1 or more warnings found 🙃");
      } else {
        hasErrors = false;
        // vscode.window.showInformationMessage("Everything is fine ✅");
        showTimedInfoMessage("Everything is fine ✅", 3000);
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
      outputChannel.appendLine("Validator Output: " + stdout);
      return;
    }

    diagnosticCollection.set(document.uri, diagnostics);
    updateStatusBarItem(); // Update status bar color based on errors
  });
}

// TODO: download according to OS

async function ensureVnuBinary(vnuBasePath: string): Promise<string | null> {
  let vnuExecutable: string;

  switch (os.platform()) {
    case "darwin":
      vnuExecutable = path.join(vnuBasePath, "vnu.osx", "vnu-runtime.sh");
      break;
    case "win32":
      vnuExecutable = path.join(vnuBasePath, "vnu.windows", "vnu-runtime.bat");
      break;
    case "linux":
      vnuExecutable = path.join(vnuBasePath, "vnu.linux", "vnu-runtime.sh");
      break;
    default:
      vscode.window.showErrorMessage("Unsupported OS platform.");
      return null;
  }

  if (fs.existsSync(vnuExecutable)) {
    return vnuExecutable; // Binary already exists, no need to download
  }

  // If the binary doesn't exist, download it
  const binaryUrl = getBinaryDownloadUrl(os.platform());
  if (!binaryUrl) {
    vscode.window.showErrorMessage(
      "Could not find the binary download URL for your platform."
    );
    return null;
  }

  try {
    await downloadBinary(binaryUrl, vnuBasePath);
    return vnuExecutable;
  } catch (error: unknown) {
    let errorMessage = "An unknown error occurred";
    if (error instanceof Error) {
      errorMessage = error.message;
    }
    vscode.window.showErrorMessage(
      `Failed to download the binary: ${errorMessage}`
    );
    return null;
  }

  // try {
  //     await downloadBinary(binaryUrl, vnuBasePath);
  //     return vnuExecutable;
  // } catch (error) {
  //     vscode.window.showErrorMessage("Failed to download the binary: " + error.message);
  //     return null;
  // }
}

function getBinaryDownloadUrl(platform: string): string | null {
  switch (platform) {
    case "darwin":
      return "https://github.com/validator/validator/releases/download/latest/vnu.osx.zip";
    case "win32":
      return "https://github.com/validator/validator/releases/download/latest/vnu.windows.zip";
    case "linux":
      return "https://github.com/validator/validator/releases/download/latest/vnu.linux.zip";
    default:
      return null;
  }
}

async function downloadBinary(url: string, destPath: string): Promise<void> {
  return new Promise((resolve, reject) => {
    const file = fs.createWriteStream(destPath);

    https
      .get(url, (response) => {
        if (response.statusCode !== 200) {
          reject(new Error(`Failed to get '${url}' (${response.statusCode})`));
          return;
        }

        response.pipe(file);

        file.on("finish", () => {
          file.close(() => resolve());
        });
      })
      .on("error", (err) => {
        fs.unlink(destPath, () => reject(err));
      });
  });
}
