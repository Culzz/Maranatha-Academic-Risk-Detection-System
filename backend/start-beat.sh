#!/bin/sh
set -eu

exec celery -A celery_app beat --loglevel=info
