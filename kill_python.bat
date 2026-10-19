@echo off
rem Kill stray Python processes, then start the MARDS backend dev server.
taskkill /F /IM python.exe 2>nul
taskkill /F /IM python3.11.exe 2>nul
timeout /t 2 /nobreak >nul
cd /d "%~dp0backend"
start "" "%~dp0venv\Scripts\python.exe" -m uvicorn main:app --host 0.0.0.0 --port 8011 --reload
