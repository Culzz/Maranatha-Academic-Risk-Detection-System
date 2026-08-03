#!/bin/sh
set -eu

CONCURRENCY="${CELERY_CONCURRENCY:-4}"

exec celery -A celery_app worker --loglevel=info --pool=prefork --concurrency="${CONCURRENCY}" -Q default,email,ml
