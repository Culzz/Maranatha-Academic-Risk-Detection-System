import os, subprocess, sys, time
os.system("taskkill /F /IM python.exe 2>nul")
os.system("taskkill /F /IM python3.11.exe 2>nul")
time.sleep(2)
os.chdir(r"c:\Users\hp\Desktop\maranatha_risk_system\backend")
subprocess.Popen([r"c:\Users\hp\Desktop\maranatha_risk_system\venv\Scripts\python.exe", "-m", "uvicorn", "main:app", "--host", "0.0.0.0", "--port", "8011", "--reload"])
print("Server started successfully")
