// src/extension.ts
import * as vscode from "vscode";
import * as path from "path";
import * as fs from "fs";
import * as os from "os";
import * as https from "https";
import AdmZip from "adm-zip";
import { exec, spawn, execSync } from "child_process";

// Configuration
// path.resolve(__dirname, 'vnu-bin');
const ARCH_MAP: { [key: string]: string } = {
  linux: 'https://github.com/validator/validator/releases/download/latest/vnu.linux.zip',
  darwin: 'https://github.com/validator/validator/releases/download/latest/vnu.osx.zip',
  win32: 'https://github.com/validator/validator/releases/download/latest/vnu.windows.zip'
};
function isJavaInstalled(): boolean {
  try {
    const output = execSync("java -version", { stdio: "pipe" }).toString();
    console.log("Java is installed:", output);
    return true;
  } catch (error) {
    console.error("Java is not installed or not in PATH.");
    return false;
  }
}
function getPlatformArch(): string {
  const platform = os.platform();
  const arch = os.arch();

  const url = ARCH_MAP[platform];
  if (url) {
    return url; // arch === 'x64' ? key : `${key}-${arch}`;
  }

  throw new Error(`Unsupported platform/architecture: ${platform}/${arch}`);
}

function checkBinaryExists(dir: string): boolean {
  return fs.existsSync(path.join(dir, 'vnu.jar'));
}

function downloadFile(url: string, dest: string, maxRedirects: number = 5): Promise<void> {
  return new Promise((resolve, reject) => {
    const file = fs.createWriteStream(dest);

    const fetchFile = (currentUrl: string, redirectsLeft: number) => {
      https.get(currentUrl, { headers: { 'User-Agent': 'Node.js' } }, (response) => {
        const { statusCode, headers } = response;

        if (statusCode && statusCode >= 300 && statusCode < 400 && headers.location) {
          if (redirectsLeft === 0) {
            return reject(new Error('Too many redirects.'));
          }
          // Follow the redirect
          fetchFile(headers.location, redirectsLeft - 1);
        } else if (statusCode === 200) {
          // Write the response to the file
          response.pipe(file);
          file.on('finish', async () => {
            console.log("Download completed");
            await new Promise((a, r) => file.close(a));
            resolve();
          });
        } else {
          // Handle other errors
          reject(new Error(`Failed to download file: ${statusCode}`));
        }
      }).on('error', (err) => {
        file.close(() => {
          fs.unlink(dest, (unlinkErr) => {
            if (unlinkErr) {
              console.error('Error removing incomplete file:', unlinkErr);
            }
            reject(err);
          });
        });
      });
    };

    fetchFile(url, maxRedirects);
  });
}


function extractArchive(archivePath: string, extractTo: string): void {
  if (archivePath.endsWith(".zip")) {
    console.log('Extracting ZIP file...');
    const zip = new AdmZip(archivePath);
    zip.extractAllTo(extractTo, true);
    console.log('Extraction completed.');
  } else if (archivePath.endsWith(".tar.gz")) {
    console.log('Extracting TAR.GZ file...');
    const command = `tar -xzf "${archivePath}" -C "${extractTo}"`;
    exec(command, (err) => {
      if (err) {
        throw new Error(`Extraction failed: ${err.message}`);
      }
      console.log('Extraction completed.');
    });
  } else {
    throw new Error(`Unsupported archive format: ${archivePath}`);
  }
}

function makeExecutable(filePath: string): void {
  try {
    fs.chmodSync(filePath, 0o755); // Sets the executable bit for the owner, group, and others
    fs.chmodSync(filePath.replace("bin/vnu", "bin/java"), 0o755); // Sets the executable bit for the owner, group, and others
    fs.chmodSync(path.resolve(path.dirname(filePath)), 0o755); // Sets the executable bit for the owner, group, and others
    console.log(`Made ${filePath} and ${path.resolve(path.dirname(filePath))} and ${filePath.replace("bin/vnu", "bin/java")} executable.`);
  } catch (err: any) {
    throw new Error(`Failed to make file executable: ${err?.message}`);
  }
}
export async function downloadVnu(config: vscode.WorkspaceConfiguration, DOWNLOAD_DIR: string): Promise<void> {
  console.log({ DOWNLOAD_DIR });
  if (!fs.existsSync(DOWNLOAD_DIR)) {
    fs.mkdirSync(DOWNLOAD_DIR, { recursive: true });
  }

  if (checkBinaryExists(DOWNLOAD_DIR)) {
    console.log('vnu binary already exists. Skipping download.');
    return;
  }

  console.log('Fetching latest vnu release info...');
  const platformUrl = getPlatformArch();
  console.log({ platformUrl });

  const outputFile = path.join(DOWNLOAD_DIR, "vnu-latest.zip");

  await downloadFile(platformUrl, outputFile);

  console.log('Extracting binary...');
  extractArchive(outputFile, DOWNLOAD_DIR);
  console.log('vnu binary downloaded and extracted successfully.');
  fs.rmSync(outputFile);
  console.log('vnu-latest.zip deleted.');

  const newVnuExecutable = path.join(DOWNLOAD_DIR, "vnu-runtime-image", "bin", "vnu", os.arch() === "win32" ? ".bat" : '');
  if (os.arch() === "win32") {

    makeExecutable(newVnuExecutable);
    console.log('makeExecutable');
  }

  await config.update(
    "vnuExecutable",
    newVnuExecutable,
    vscode.ConfigurationTarget.Global
  );
  vnuExecutable = newVnuExecutable;
  console.log({ newVnuExecutable });


}


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

  if (!isJavaInstalled()) {
    vscode.window.showErrorMessage("JRE must be installed.");
    return;
  }
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
  const downloadVnuCommand = vscode.commands.registerCommand(
    "htmlValidator.downloadVnu",
    () => {
      let extensionPath = context.extensionPath;

      downloadVnu(config, path.resolve(path.join(
        extensionPath,
        "validator",
      )));
    });
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
  context.subscriptions.push(downloadVnuCommand);
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
  const config = vscode.workspace.getConfiguration("htmlValidator");

  const noStream = config.get<boolean>("noStream", true);
  const noLangDetect = config.get<boolean>("noLangDetect", true);
  console.log({ noStream, noLangDetect });
  const args = ["--format", "json", "--exit-zero-always", noStream ? '--no-stream' : '', noLangDetect ? '--no-langdetect' : '', noStream ? '--no-stream' : '', filePath];

  const outputChannel = vscode.window.createOutputChannel("HTML Validator");
  outputChannel.clear();

  // --no-stream

  const process = spawn(vnuExecutable, args, { shell: true });

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
        const autoOpenProblems = config.get<boolean>("autoOpenProblems", true);
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
