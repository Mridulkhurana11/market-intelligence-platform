@echo off
setlocal
cd /d "%~dp0"
if not exist .venv (
  py -m venv .venv
  if errorlevel 1 exit /b 1
)
call .venv\Scripts\activate.bat
python -m pip install --upgrade pip
pip install -r requirements.txt
if errorlevel 1 exit /b 1
python run_analysis.py
if errorlevel 1 exit /b 1
echo.
echo Analysis complete. Dashboard JSON is ready in frontend\public\data\market_intelligence.json
pause
