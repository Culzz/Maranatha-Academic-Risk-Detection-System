#!/usr/bin/env bash
# Start the MARDS backend dev server (uvicorn, auto-reload on port 8011).
# Assumes an activated Python virtualenv — see README Quickstart.
set -euo pipefail
cd "$(dirname "$0")/backend"
python -m uvicorn main:app --host 0.0.0.0 --port 8011 --reload
