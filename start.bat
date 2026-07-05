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
REM The analysis engine requires the pinned tree-sitter stack (tree-sitter
REM 0.21.x + tree-sitter-languages), which only installs on Python 3.11/3.12.
REM Prefer the "project22_py312" conda env when it exists; otherwise fall back
REM to the default python (analysis needs a supported interpreter).
conda env list 2>nul | findstr /C:"project22_py312" >nul 2>nul
if not errorlevel 1 (
    echo Using conda env: project22_py312
    conda run --no-capture-output -n project22_py312 python wsgi.py
) else (
    python wsgi.py
)
