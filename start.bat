@echo off
cd /d "%~dp0"
echo Building frontend...
cd code-sleuth-react-ui
call npm run build
if errorlevel 1 (
  echo Build failed. Check the errors above.
  pause
  exit /b 1
)
cd ..
echo.
echo ============================================================
echo   Starting server on http://127.0.0.1:5000
echo   Keep this window OPEN. Close it to stop the server.
echo ============================================================
echo.
py -3.10 wsgi.py
echo.
echo Server stopped or failed to start. Read the message above.
pause
