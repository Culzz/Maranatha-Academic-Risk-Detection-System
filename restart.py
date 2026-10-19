"""Restart the MARDS backend dev server.

Kills any running Python processes, then starts uvicorn on port 8011 from
the backend/ directory next to this script. Run it from a terminal where
your virtualenv is active (or call it with the venv's python).
"""

import os
import subprocess
import sys
import time
from pathlib import Path

os.system("taskkill /F /IM python.exe 2>nul")
os.system("taskkill /F /IM python3.11.exe 2>nul")
time.sleep(2)

backend = Path(__file__).resolve().parent / "backend"
subprocess.Popen(
    [sys.executable, "-m", "uvicorn", "main:app",
     "--host", "0.0.0.0", "--port", "8011", "--reload"],
    cwd=backend,
)
print("Server starting on http://localhost:8011")
