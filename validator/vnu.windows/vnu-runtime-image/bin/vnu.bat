@echo off
setlocal
set JLINK_VM_OPTIONS=
set DIR=%~dp0
"%DIR%\java" %JLINK_VM_OPTIONS% -m vnu/nu.validator.client.SimpleCommandLineValidator %*
endlocal
