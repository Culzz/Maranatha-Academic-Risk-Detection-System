@echo off
taskkill /F /IM python.exe 2>nul
taskkill /F /IM python3.11.exe 2>nul
timeout /t 2 /nobreak >nul
cd /d "c:\Users\hp\Desktop\maranatha_risk_system\backend"
start "" "c:\Users\hp\Desktop\maranatha_risk_system\venv\Scripts\python.exe" -m uvicorn main:app --host 0.0.0.0 --port 8002 --reload
