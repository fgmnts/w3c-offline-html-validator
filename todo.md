# W3C Offline HTML Validator - Development TODO

## Overview

This document outlines the development tasks and improvements needed for the W3C Offline HTML Validator VSCode extension. The extension provides offline HTML validation using the W3C Nu HTML Checker (vnu) tool.

## Current Issues & Improvements

### 🔴 Critical Bug Fixes

#### 1. Fix Duplicate --no-stream Argument

**Priority: HIGH**  
**Issue**: Line 279 in `extension.ts` adds `--no-stream` twice when `noStream` is true

```typescript
// Current (buggy):
const args = [
  "--format",
  "json",
  "--exit-zero-always",
  noStream ? "--no-stream" : "",
  noLangDetect ? "--no-langdetect" : "",
  noStream ? "--no-stream" : "",
  quotedFilePath,
];

// Should be:
const args = ["--format", "json", "--exit-zero-always"];
if (noStream) args.push("--no-stream");
if (noLangDetect) args.push("--no-langdetect");
args.push(quotedFilePath);
```

#### 2. Fix Empty String Arguments

**Priority: HIGH**  
**Issue**: Empty strings are added to command arguments when config options are false
**Impact**: Can cause command execution failures
**Solution**: Filter out empty strings or use conditional argument building

#### 3. Fix Extension Update Path Issue

**Priority: HIGH**  
**Issue**: vnuExecutable setting doesn't update when extension updates (e.g., 0.0.15 → 0.0.16)
**Current**: `c:\Users\...\fgmnts.w3c-offline-html-validator-0.0.15\...`
**Should be**: `c:\Users\...\fgmnts.w3c-offline-html-validator-0.0.16\...`
**Solution**: Detect extension version changes and update the path automatically

### 🟡 Code Quality Improvements

#### 4. Implement All Configuration Options

**Priority: MEDIUM**  
**Issue**: Extension defines config options but doesn't use them
**Missing Usage**:

- `showErrorMessages` - Control error message display
- `showWarningMessages` - Control warning message display
- `showOkMessages` - Control success message display
  **Solution**: Use these options in the validation result handling logic

#### 5. Fix Status Bar Memory Leak

**Priority: MEDIUM**  
**Issue**: Status bar item is recreated on every update instead of updating properties
**Current**: `statusBarItem.hide(); statusBarItem.dispose();` then create new
**Solution**: Update existing item properties instead of recreating

#### 6. Improve Error Handling

**Priority: MEDIUM**  
**Issues**:

- No timeout handling for child process
- No JSON validation before parsing
- Generic error messages
  **Solution**: Add process timeout, validate JSON structure, provide specific error messages

#### 7. Add Input Validation

**Priority: MEDIUM**  
**Missing Validations**:

- File path existence
- Document language ID
- vnu executable permissions
- File accessibility
  **Solution**: Add comprehensive input validation before processing

### 🟢 Performance & Security

#### 8. Add Debouncing

**Priority: LOW**  
**Issue**: Multiple rapid saves can trigger simultaneous validation processes
**Solution**: Implement 500ms debounce to prevent overlapping validations

#### 9. Remove Hardcoded Values

**Priority: LOW**  
**Hardcoded Values**:

- Timeout: 2000ms
- Status bar alignment: Left, -100
- Message display duration
  **Solution**: Make these configurable through settings

#### 10. Improve Command Security

**Priority: LOW**  
**Issue**: Potential command injection with special characters in paths
**Current**: Basic quoting with `"${path}"`
**Solution**: Use proper argument escaping or spawn with array arguments

#### 11. Add Async File Operations

**Priority: LOW**  
**Issue**: Synchronous file operations can block main thread
**Current**: `fs.existsSync(vnuExecutable)`
**Solution**: Use `fs.promises.access()` or similar async methods

#### 12. Improve State Management

**Priority: LOW**  
**Issue**: Global variables for state management
**Current**: `hasErrors`, `hasWarnings` as global variables
**Solution**: Implement proper state management with cleanup

## Implementation Priority

### Phase 1: Critical Fixes (Week 1)

- [ ] Fix duplicate --no-stream argument
- [ ] Fix empty string arguments
- [ ] Fix extension update path issue

### Phase 2: Core Improvements (Week 2)

- [ ] Implement configuration options
- [ ] Fix status bar memory leak
- [ ] Improve error handling
- [ ] Add input validation

### Phase 3: Performance & Polish (Week 3)

- [ ] Add debouncing
- [ ] Remove hardcoded values
- [ ] Improve command security
- [ ] Add async file operations
- [ ] Improve state management

## Testing Strategy

### Manual Testing

1. Test with HTML files containing validation errors
2. Test with files containing spaces in paths
3. Test extension update scenario
4. Test rapid save scenarios
5. Test with various vnu configuration options

### Automated Testing

1. Unit tests for argument building
2. Integration tests for validation process
3. Configuration tests for all settings
4. Error handling tests

## Configuration Reference

### Current Settings

```json
{
  "htmlValidator.vnuExecutable": "string",
  "htmlValidator.showErrorMessages": "boolean (default: true)",
  "htmlValidator.showWarningMessages": "boolean (default: true)",
  "htmlValidator.showOkMessages": "boolean (default: true)",
  "htmlValidator.autoOpenProblems": "boolean (default: true)",
  "htmlValidator.noStream": "boolean (default: false)",
  "htmlValidator.noLangDetect": "boolean (default: false)"
}
```

### Proposed Additional Settings

```json
{
  "htmlValidator.messageTimeout": "number (default: 2000)",
  "htmlValidator.validationDebounce": "number (default: 500)",
  "htmlValidator.processTimeout": "number (default: 30000)"
}
```

## Notes

- The extension uses the W3C Nu HTML Checker (vnu) tool for validation
- vnu outputs JSON format with error/warning messages
- Extension supports Windows, macOS, and Linux platforms
- Current version: 0.0.16
- Target VSCode version: ^1.93.0

## Related Files

- `src/extension.ts` - Main extension code
- `package.json` - Extension manifest and configuration
- `tsconfig.json` - TypeScript configuration
- `eslint.config.mjs` - Linting configuration
