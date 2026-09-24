@echo off
setlocal
cd /d "%~dp0"
if exist "%~dp0.tools\node-v24.21.0-win-x64\node.exe" set "PATH=%~dp0.tools\node-v24.21.0-win-x64;%PATH%"
if not exist "node_modules\tsx" (
  call npm ci
  if errorlevel 1 goto failed
)
call npm run dev
if errorlevel 1 goto failed
exit /b 0
:failed
echo.
echo Startup failed. Read the message above.
pause
exit /b 1
