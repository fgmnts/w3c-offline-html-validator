import * as vscode from "vscode";
import * as path from "path";
import * as fs from "fs";
import { execSync } from "child_process";

// Helper function to check if a binary is Intel architecture
function isIntelBinary(binaryPath: string): boolean {
    try {
        const result = execSync(`file "${binaryPath}"`, { encoding: 'utf8' });
        return result.includes('x86_64') || result.includes('i386');
    } catch {
        return false;
    }
}

// Helper function to check if Rosetta 2 is installed
function hasRosettaInstalled(): boolean {
    try {
        execSync("arch -x86_64 true", { stdio: 'ignore' });
        return true;
    } catch {
        return false;
    }
}

export const detectRosettaComplex = (extensionPath: string) => {
    if (process.platform === "darwin" && process.arch === "arm64") {
        const javaPath = path.join(extensionPath, "validator", "vnu.osx", "vnu-runtime-image", "bin", "java");
        if (fs.existsSync(javaPath) && isIntelBinary(javaPath) && !hasRosettaInstalled()) {
            vscode.window.showErrorMessage(
                "Rosetta 2 is required to run the W3C validator binary on Apple Silicon Macs.\n" +
                "Please install it by running:  softwareupdate --install-rosetta"
            );
            return; // skip running vnu
        }
    }
};

export const detectRosettaSimple = () => {
    try {
        execSync("arch -x86_64 true");
    } catch {
        vscode.window.showErrorMessage(
            "Rosetta 2 is not installed. Run:\nsoftwareupdate --install-rosetta"
        );
    }
};