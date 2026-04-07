@echo off
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
echo Starting server...
python app.py
