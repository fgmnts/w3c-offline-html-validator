// src/extension.ts
import * as vscode from "vscode";
import * as childProcess from "child_process";
import * as path from "path";
import * as fs from "fs";
import * as os from "os";

let vnuExecutable: string;
let isValidationEnabled = true;
let statusBarItem: vscode.StatusBarItem;
let hasErrors = false;
let hasWarnings = false;
let _context: vscode.ExtensionContext;
let hasValidated = false;
let globalErrorCount = 0;
let globalWarningCount = 0;

// Animation variables
let animationInterval: NodeJS.Timeout | null = null;
let animationFrame = 0;
const brailleFrames = ['⠋', '⠙', '⠹', '⠸', '⠼', '⠴', '⠦', '⠧', '⠇', '⠏'];

// Process tracking for cleanup
let currentProcess: childProcess.ChildProcess | null = null;
let currentTimeout: NodeJS.Timeout | null = null;

let enableDebugLogging = false;
const logTag = "W3C-OHV";

function log(...args: any[]) {
  if (enableDebugLogging) {
    console.log.apply(console, [logTag, ...args]);
  }
}

export async function activate(context: vscode.ExtensionContext) {
  log("Activating W3C Offline HTML Validator extension");
  _context = context;
  // Create diagnostic collection
  const diagnosticCollection =
    vscode.languages.createDiagnosticCollection("html-validator");
  context.subscriptions.push(diagnosticCollection);

  // Get validation enabled state from global state
  isValidationEnabled = context.globalState.get<boolean>(
    "offlineW3C.isValidationEnabled",
    true
  );

  // Get the vnuExecutable path from configuration
  const config = vscode.workspace.getConfiguration("offlineW3C");
  let extensionPath = context.extensionPath;
  enableDebugLogging = config.get<boolean>("enableDebugLogging", false);

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

  log("Offline W3C bin", vnuExecutable);


  // Create the status bar item
  statusBarItem = vscode.window.createStatusBarItem(vscode.StatusBarAlignment.Left, -100);
  statusBarItem.command = "offlineW3C.toggleValidation";
  context.subscriptions.push(statusBarItem);
  // Set initial status bar item state
  updateStatusBarItem();
  // Register the toggle validation command
  const toggleValidationCommand = vscode.commands.registerCommand("offlineW3C.toggleValidation", () => {
    isValidationEnabled = !isValidationEnabled;
    stopAnimation();
    updateStatusBarItem();
    context.globalState.update("offlineW3C.isValidationEnabled", isValidationEnabled);
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
        stopAnimation();
        cleanupProcess();
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
  log("W3C Offline HTML Validator extension activated");
}

export function deactivate() {
  stopAnimation();
  cleanupProcess();
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
  statusBarItem.command = "offlineW3C.toggleValidation";
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
      statusBarItem.tooltip = `W3C W3C Offline HTML Validator - ${globalErrorCount} validation error${globalErrorCount !== 1 ? 's' : ''} found`;
      statusBarItem.backgroundColor = new vscode.ThemeColor("statusBarItem.errorBackground");
      statusBarItem.color = new vscode.ThemeColor("statusBarItem.errorForeground");
    }
    else if (hasWarnings && globalWarningCount > 0) {
      // Warnings found - yellow background with count
      statusBarItem.text = `W3C: ${globalWarningCount} warning${globalWarningCount !== 1 ? 's' : ''}`;
      statusBarItem.tooltip = `W3C W3C Offline HTML Validator - ${globalWarningCount} validation warning${globalWarningCount !== 1 ? 's' : ''} found`;
      statusBarItem.backgroundColor = new vscode.ThemeColor("statusBarItem.warningBackground");
      statusBarItem.color = new vscode.ThemeColor("statusBarItem.warningForeground");
    }
    else if (hasValidated) {
      // Success case - green background
      statusBarItem.text = "W3C: OK";
      statusBarItem.tooltip = "W3C W3C Offline HTML Validator - No validation issues";
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

function animateStatusBarItem() {
  // Stop any existing animation
  stopAnimation();
  
  // Reset animation frame
  animationFrame = 0;
  
  // Start animation with 100ms interval for smooth effect
  animationInterval = setInterval(() => {
    if (statusBarItem && isValidationEnabled) {
      const currentFrame = brailleFrames[animationFrame % brailleFrames.length];
      statusBarItem.text = `W3C ${currentFrame}`;
      statusBarItem.tooltip = "W3C Offline HTML Validator - Validating...";
      statusBarItem.backgroundColor = new vscode.ThemeColor("statusBarItem.prominentBackground");
      statusBarItem.color = new vscode.ThemeColor("statusBarItem.prominentForeground");
      animationFrame++;
    }
  }, 100);
}

function stopAnimation() {
  if (animationInterval) {
    clearInterval(animationInterval);
    animationInterval = null;
  }
}

function cleanupProcess() {
  if (currentTimeout) {
    clearTimeout(currentTimeout);
    currentTimeout = null;
  }
  if (currentProcess && !currentProcess.killed) {
    currentProcess.kill();
    currentProcess = null;
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
    stopAnimation();
    cleanupProcess();
    return;
  }
  // Check if vnuExecutable exists
  if (!vnuExecutable || !fs.existsSync(vnuExecutable)) {
    vscode.window.showErrorMessage("vnu executable not found. Expected path: " + vnuExecutable);
    stopAnimation();
    cleanupProcess();
    return;
  }

  log("Validating document", document.uri.fsPath);

  animateStatusBarItem();

  const filePath = document.uri.fsPath;
  const config = vscode.workspace.getConfiguration("offlineW3C");
  const noStream = config.get<boolean>("noStream", true);
  const noLangDetect = config.get<boolean>("noLangDetect", true);
  // Quote paths to handle spaces safely on Windows
  const args = [
    "--format", "json",
    "--exit-zero-always",
    ...(noStream ? ["--no-stream"] : []),
    ...(noLangDetect ? ["--no-langdetect"] : []),
    "--",
    filePath
  ];
  log(vnuExecutable, args);
  
  // Clean up any existing process
  cleanupProcess();
  
  try {
    currentProcess = childProcess.spawn(vnuExecutable, args, { shell: false });
  } catch (spawnError) {
    const errorMessage = spawnError instanceof Error ? spawnError.message : "Unknown spawn error";
    vscode.window.showErrorMessage(`Failed to start validator process: ${errorMessage}`);
    stopAnimation();
    return;
  }
  
  let stdout = "";
  let stderr = "";
  
  // Set up timeout for long-running validations (30 seconds)
  currentTimeout = setTimeout(() => {
    if (currentProcess && !currentProcess.killed) {
      currentProcess.kill();
      vscode.window.showErrorMessage("Validation timed out after 30 seconds");
      stopAnimation();
    }
  }, 30000);
  
  currentProcess.stdout?.on("data", (data) => {
    stdout += data.toString();
  });
  
  currentProcess.stderr?.on("data", (data) => {
    stderr += data.toString();
  });
  
  // Handle process errors (e.g., executable not found, permission denied)
  currentProcess.on("error", (error) => {
    if (currentTimeout) {
      clearTimeout(currentTimeout);
      currentTimeout = null;
    }
    vscode.window.showErrorMessage(`Validator process error: ${error.message}`);
    stopAnimation();
  });
  
  currentProcess.on("close", (code) => {
    // Clear timeout since process completed
    if (currentTimeout) {
      clearTimeout(currentTimeout);
      currentTimeout = null;
    }
    
    const diagnostics = [];
    
    // Handle non-zero exit codes
    if (code !== 0 && code !== null) {
      vscode.window.showErrorMessage(`Validator process exited with code ${code}`);
      stopAnimation();
      currentProcess = null; // Clear process reference
      return;
    }
    
    try {
      // Check if we have valid JSON output
      if (!stderr.trim()) {
        vscode.window.showErrorMessage("Validator produced no output");
        stopAnimation();
        currentProcess = null; // Clear process reference
        return;
      }
      
      const result = JSON.parse(stderr);
      log(result);
      
      // Validate result structure
      if (!result || typeof result !== 'object') {
        vscode.window.showErrorMessage("Validator output is not a valid JSON object");
        stopAnimation();
        currentProcess = null; // Clear process reference
        return;
      }
      
      if (!Array.isArray(result.messages)) {
        vscode.window.showErrorMessage("Validator output missing 'messages' array");
        stopAnimation();
        currentProcess = null; // Clear process reference
        return;
      }
      
      let severeCount = 0;
      let warningCount = 0;
      for (const message of result.messages) {
        try {
          // Validate message structure
          if (!message || typeof message !== 'object') {
            log("Skipping invalid message:", message);
            continue;
          }
          
          const line = Math.max(0, (message.lastLine || 1) - 1);
          const col = Math.max(0, (message.lastColumn || 1) - 1);
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
          
          const diagnostic = new vscode.Diagnostic(range, message.message || "Unknown validation issue", severity);
          diagnostics.push(diagnostic);
        } catch (messageError) {
          log("Error processing message:", messageError, "Message:", message);
          // Continue processing other messages
        }
      }
      if (severeCount > 0) {
        log("Errors found", severeCount);
        hasErrors = true;
        hasWarnings = false;
        hasValidated = true;
        globalErrorCount = severeCount;
        globalWarningCount = 0;
        // Fetch configuration values
        const autoOpenProblems = config.get<boolean>("autoOpenProblems", false);
        if (autoOpenProblems) {
          // Note: This may still steal focus, so it's disabled by default
          vscode.commands.executeCommand("workbench.actions.view.problems");
        }
      }
      else if (warningCount > 0) {
        log("Warnings found", warningCount);
        hasErrors = false;
        hasWarnings = true;
        hasValidated = true;
        globalErrorCount = 0;
        globalWarningCount = warningCount; // Store the local warningCount in global variable
      }
      else {
        log("OK");
        hasErrors = false;
        hasWarnings = false;
        hasValidated = true;
        globalErrorCount = 0;
        globalWarningCount = 0;
      }
    }
    catch (e) {
      const errorMessage = e instanceof Error ? e.message : "Unknown error";
      log("JSON parse error:", errorMessage);
      log("Raw stderr output:", stderr);
      vscode.window.showErrorMessage(`Failed to parse validator output: ${errorMessage}. Check the output panel for details.`);
      stopAnimation();
      currentProcess = null; // Clear process reference
      return;
    }
    diagnosticCollection.set(document.uri, diagnostics);
    // Stop animation and update status bar to show current validation state
    stopAnimation();
    currentProcess = null; // Clear process reference
    updateStatusBarItem();
  });
}
