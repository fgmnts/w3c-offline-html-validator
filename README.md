# **W3C Offline HTML Validator**

A Visual Studio Code extension that provides offline HTML validation using W3C standards. This extension integrates the W3C Nu HTML Checker directly into VSCode, allowing you to validate your HTML files without an internet connection. All necessary binaries are included in the package, ensuring seamless setup and operation.

![Icon](https://github.com/fgmnts/w3c-offline-html-validator/raw/main/icon.jpg)

---

## **Table of Contents**

- [Features](#features)
- [Requirements](#requirements)
- [Installation](#installation)
- [Usage](#usage)
  - [Automatic Validation on Save](#automatic-validation-on-save)
  - [Status Bar Integration](#status-bar-integration)
  - [Enabling/Disabling Validation](#enablingdisabling-validation)
- [Extension Settings](#extension-settings)
- [Known Issues](#known-issues)
- [Release Notes](#release-notes)
- [Contributing](#contributing)
- [License](#license)

---

## **Features**

- **Offline HTML Validation**: Validate your HTML files using W3C standards without needing an internet connection.
- **Automatic Validation on Save**: Automatically validates HTML files every time you save them.
- **Status Bar Integration**:
  - Clickable icon to enable or disable validation on save.
- **Error and Warning Diagnostics**:
  - Validation errors and warnings are displayed in the Problems pane.
  - Errors and warnings are highlighted directly in the editor.
- **Persistent Settings**:
  - Validation state (enabled/disabled) is saved between sessions.
  - Configuration options are available for advanced users.

---

## **Requirements**

- **Visual Studio Code** version **1.93.0** or higher.
- **Operating System**: Windows, macOS, or Linux.
- **No additional installations required**: All necessary binaries are included.

---

## **Installation**

1. **Install the Extension**:
   - Search for **"W3C Offline HTML Validator"** in the VSCode Extensions Marketplace.
   - Click **Install**.

2. **Reload VSCode**:
   - After installation, reload VSCode to activate the extension.

---

## **Usage**

### **Automatic Validation on Save**

- The extension automatically validates any HTML file when you save it.
- If there are validation errors or warnings, they will appear in the **Problems** pane and be highlighted in the editor.

### **Enabling/Disabling Validation**

- **Toggle Validation**:
  - Click the **"HTML Validator"** status bar item to enable or disable validation.
- **Persistent Setting**:
  - The validation state is saved globally and persists across sessions.

---

## **Extension Settings**

The extension contributes the following settings:

1. **`htmlValidator.vnuExecutable`**:
   - **Type**: `string`
   - **Default**: *(Automatically set based on OS)*
   - **Description**: Path to the `vnu` executable file.
   - **Usage**: Advanced users can specify a custom path to the `vnu` executable if needed.

---

## **Known Issues**

- **Auto-Dismiss Pop-up Messages**:
  - The extension uses status bar messages instead of pop-up notifications to inform about validation results due to limitations in programmatically dismissing pop-ups.
- **Performance on Large Files**:
  - Validation may be slower for very large HTML files.

---

## **Release Notes**

### **0.0.10**

- **Refactor**

### **0.0.9**

- **Status Bar Item**:
  - Added status bar integration for toggling validation.
  - Displays validation status and errors.
- **Persistent Settings**:
  - Validation state is stored globally and persists between sessions.

### **0.0.2** - **0.0.8**

- **Improvements**

### **0.0.1**

- **Initial Release**:
  - Basic offline HTML validation on save.
  - Inclusion of all necessary binaries for cross-platform support.

---

## **Contributing**

Contributions are welcome! Please follow these steps:

1. **Fork the Repository**:
   - Visit the [GitHub repository](https://github.com/fgmnts/w3c-offline-html-validator) and fork it.

2. **Clone Your Fork**:
   ```bash
   git clone https://github.com/your-username/w3c-offline-html-validator.git
   ```

3. **Install Dependencies**:
   ```bash
   cd w3c-offline-html-validator
   npm install
   ```

4. **Development Workflow**:
   - **Use Node.js Version 20**:
     ```bash
     nvm use 20
     ```
   - **Compile the Extension**:
     ```bash
     npm run compile
     ```
   - **Package the Extension**:
     ```bash
     vsce package
     ```
   - **Release the Extension**:
     ```bash
     vsce publish
     ```
   - **Run in Debug Mode**:
     - Press `F5` in VSCode to launch the extension in a new Extension Development Host window.

5. **Submit a Pull Request**:
   - Push your changes to your fork and submit a pull request to the `main` branch.

---

## **License**

TODO

---

## **Contact**

For questions, suggestions, or issues, please open an issue on the [GitHub repository](https://github.com/fgmnts/w3c-offline-html-validator/issues).

---

## **Additional Information**

- **Repository**: [https://github.com/fgmnts/w3c-offline-html-validator](https://github.com/fgmnts/w3c-offline-html-validator)
- **Publisher**: `fgmnts`
- **Category**: Other

---

## **Acknowledgements**

- **W3C Nu HTML Checker**: This extension utilizes the [W3C Nu HTML Checker](https://validator.github.io/validator/) for validation.
- **VSCode Extension API**: Built using the [Visual Studio Code Extension API](https://code.visualstudio.com/api).

---

**Enjoy a seamless, offline HTML validation experience right within Visual Studio Code!**