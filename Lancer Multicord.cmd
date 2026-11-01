@echo off
cd /d "%~dp0"
where node >nul 2>&1
if errorlevel 1 (
  echo Installez Node.js 24 LTS depuis https://nodejs.org puis relancez Multicord.
  pause
  exit /b 1
)
if not exist node_modules call npm install
if errorlevel 1 (
  pause
  exit /b 1
)
start "" "http://localhost:3000"
call npm run dev
pause
