// src/extension.ts
import * as vscode from "vscode";
import * as child_process from "child_process";
import * as path from "path";
import * as fs from "fs";

let extPath: string | null = null

export function activate(context: vscode.ExtensionContext) {
  console.log("activate activate activate");

  const extensionPath = context.extensionUri.path;
  extPath = extensionPath
  console.log('Extension folder path:', extensionPath);


  const diagnosticCollection =
    vscode.languages.createDiagnosticCollection("html-validator");
  context.subscriptions.push(diagnosticCollection);

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

export function deactivate() {}

function validate(
  document: vscode.TextDocument,
  diagnosticCollection: vscode.DiagnosticCollection
): void {
  console.log("validate validate validate");
  const config = vscode.workspace.getConfiguration("htmlValidator");
  let vnuJarPath = config.get<string>("vnuJarPath") || "";
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

  console.log("debug ext", { extPath });
  console.log("debug ext", { message });
  console.log("debug ext", { vnuJarPath });

  // Resolve the path if it contains workspace folder variable
  if (vnuJarPath.includes("${workspaceFolder}") && extPath) {
    // const workspaceFolder = vscode.workspace.workspaceFolders ? vscode.workspace.workspaceFolders[0].uri.fsPath : '';
    vnuJarPath = vnuJarPath.replace("${workspaceFolder}", extPath);
  }

  console.log("debug ext", { vnuJarPath });

  // Check if vnu.jar exists synchronously
  if (!vnuJarPath || !fs.existsSync(vnuJarPath)) {
    vscode.window.showErrorMessage(
      "vnu.jar not found. Please check the htmlValidator.vnuJarPath setting. " +
        vnuJarPath
    );
    return;
  }

  const filePath = document.uri.fsPath;

  const javaExecutable = "java";
  const args = [
    "-jar",
    vnuJarPath,
    "--format",
    "json",
    "--exit-zero-always",
    filePath,
  ];

  const outputChannel = vscode.window.createOutputChannel("HTML Validator");
  outputChannel.clear();
  // outputChannel.show(); // Uncomment if you want the Output channel to be visible

  const process = child_process.spawn(javaExecutable, args);

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
        if (severity === vscode.DiagnosticSeverity.Error) severeCount++;
        else warningCount++;
        const diagnostic = new vscode.Diagnostic(
          range,
          message.message,
          severity
        );
        diagnostics.push(diagnostic);
      }
      if (severeCount > 0)
        vscode.window.showErrorMessage("1 or more ERRORS found, please fix");
      else if (warningCount > 0)
        vscode.window.showWarningMessage("1 or more WARNINGS found");
      else vscode.window.showInformationMessage("Everything is fine");
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
  });
}
