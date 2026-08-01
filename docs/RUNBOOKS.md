# Maranatha Risk System -- Operational Runbooks

Quick-reference playbook for operations staff. Each section covers one failure scenario with diagnosis steps and fixes.

---

## 1. Database is Full

**Symptoms:** INSERT/UPDATE queries fail, application returns 500 errors, PostgreSQL logs "could not extend file" or "No space left on device".

**Diagnosis:**

```bash
# Check disk usage
df -h

# Check database sizes
psql -U postgres -c "SELECT pg_database.datname, pg_size_pretty(pg_database_size(pg_database.datname)) FROM pg_database ORDER BY pg_database_size(pg_database.datname) DESC;"

# Find largest tables
psql -U postgres -d maranatha_risk -c "SELECT relname, pg_size_pretty(pg_total_relation_size(relid)) FROM pg_catalog.pg_statio_user_tables ORDER BY pg_total_relation_size(relid) DESC LIMIT 10;"
```

**Resolution:**

1. **Archive old data** -- move consumed SSE events, old notifications, and expired sessions to archive tables or delete them:
   ```sql
   DELETE FROM consumed_events WHERE consumed_at < NOW() - INTERVAL '90 days';
   DELETE FROM notifications WHERE created_at < NOW() - INTERVAL '180 days' AND is_read = true;
   DELETE FROM blacklisted_tokens WHERE expires_at < NOW();
   VACUUM FULL;
   ```
2. **Expand disk** -- if on a cloud VM, resize the volume and extend the filesystem:
   ```bash
   # AWS example
   aws ec2 modify-volume --volume-id vol-xxx --size 100
   sudo growpart /dev/xvda 1
   sudo resize2fs /dev/xvda1
   ```
3. **Prevent recurrence** -- ensure Celery beat cleanup tasks are running (token cleanup, event cleanup, consumed-event cleanup).

---

## 2. Redis Ran Out of Memory

**Symptoms:** Celery tasks fail to enqueue, SSE connections drop, application logs "OOM command not allowed" from Redis.

**Diagnosis:**

```bash
redis-cli INFO memory
redis-cli DBSIZE
```

**Resolution:**

1. **Flush non-critical keys** -- SSE event caches and consumed-event markers can be safely flushed:
   ```bash
   redis-cli KEYS "sse:*" | xargs redis-cli DEL
   redis-cli KEYS "consumed:*" | xargs redis-cli DEL
   ```
2. **Increase maxmemory** in `redis.conf`:
   ```
   maxmemory 512mb
   maxmemory-policy allkeys-lru
   ```
   Then restart Redis: `sudo systemctl restart redis`
3. **Check for key leaks** -- look for unexpectedly large key counts:
   ```bash
   redis-cli --bigkeys
   ```

---

## 3. ML Model Not Loading

**Symptoms:** Risk computation endpoint returns 500, logs show "FileNotFoundError" or "XGBoostError", student risk scores stop updating.

**Diagnosis:**

```bash
# Check model file exists
ls -la /opt/maranatha_risk_system/backend/ml/outputs/

# Check Celery worker logs
journalctl -u maranatha-celery -n 50 --no-pager

# Verify Python can load the model
cd /opt/maranatha_risk_system/backend
/opt/venv/bin/python -c "import xgboost; m = xgboost.Booster(); m.load_model('ml/outputs/model.json'); print('OK')"
```

**Resolution:**

1. **File missing** -- restore model file from backup or re-train:
   ```bash
   cp /backups/ml/model.json /opt/maranatha_risk_system/backend/ml/outputs/model.json
   ```
2. **Version mismatch** -- ensure the installed XGBoost version matches the one used for training. Check `requirements.txt` for the pinned version.
3. **Restart Celery worker** -- the model is loaded into worker memory:
   ```bash
   sudo systemctl restart maranatha-celery
   ```
4. **Fallback** -- if the model cannot be restored immediately, the system will use rule-based risk scoring as a fallback. Monitor logs to confirm fallback is active.

---

## 4. Celery Workers Down

**Symptoms:** Scheduled tasks (risk computation, reminders, email) stop running. Celery beat logs show tasks being scheduled but not executed.

**Diagnosis:**

```bash
# Check worker status
sudo systemctl status maranatha-celery
sudo systemctl status maranatha-celery-beat

# Check Redis connectivity (Celery broker)
redis-cli PING

# Check worker logs
journalctl -u maranatha-celery -n 100 --no-pager

# List active workers
cd /opt/maranatha_risk_system/backend
/opt/venv/bin/celery -A celery_app inspect active
```

**Resolution:**

1. **Redis down** -- start Redis first:
   ```bash
   sudo systemctl start redis
   ```
2. **Restart workers:**
   ```bash
   sudo systemctl restart maranatha-celery
   sudo systemctl restart maranatha-celery-beat
   ```
3. **Check environment** -- verify `.env` file has correct `REDIS_URL` and `DATABASE_URL`.
4. **Check queue backlog** -- if tasks piled up:
   ```bash
   redis-cli LLEN default
   redis-cli LLEN email
   redis-cli LLEN ml
   ```
   If backlog is very large, consider purging stale tasks:
   ```bash
   /opt/venv/bin/celery -A celery_app purge -Q email -f
   ```

---

## 5. Email Sending Failing

**Symptoms:** Students and staff not receiving email notifications. Celery logs show SMTP errors or timeouts.

**Diagnosis:**

```bash
# Check Celery email queue
redis-cli LLEN email

# Check worker logs for SMTP errors
journalctl -u maranatha-celery -n 50 --no-pager | grep -i smtp

# Test SMTP connectivity manually
python3 -c "
import smtplib
s = smtplib.SMTP('smtp.example.com', 587)
s.starttls()
s.login('user', 'pass')
print('SMTP OK')
s.quit()
"
```

**Resolution:**

1. **Check credentials** -- verify `SMTP_HOST`, `SMTP_PORT`, `SMTP_USER`, `SMTP_PASSWORD` in `.env`.
2. **Check firewall** -- ensure the server can reach the SMTP host on the configured port:
   ```bash
   nc -zv smtp.example.com 587
   ```
3. **Rate limiting** -- some providers limit sends per hour. Check the provider's dashboard for bounced or throttled messages.
4. **Restart email queue processing:**
   ```bash
   sudo systemctl restart maranatha-celery
   ```

---

## 6. SSE Connections Dropping

**Symptoms:** Frontend shows stale data, real-time notifications stop arriving, browser console shows EventSource reconnection loops.

**Diagnosis:**

```bash
# Check Redis pub/sub channels
redis-cli PUBSUB CHANNELS "sse:*"

# Check active SSE connections on the server
ss -tnp | grep :8000 | wc -l

# Check Nginx timeout settings
grep -i timeout /etc/nginx/sites-enabled/maranatha*
```

**Resolution:**

1. **Nginx proxy timeouts** -- SSE requires long-lived connections. Update Nginx config:
   ```nginx
   location /api/sse/ {
       proxy_pass http://127.0.0.1:8000;
       proxy_set_header Connection '';
       proxy_http_version 1.1;
       chunked_transfer_encoding off;
       proxy_buffering off;
       proxy_cache off;
       proxy_read_timeout 86400s;
       proxy_send_timeout 86400s;
   }
   ```
   Then reload: `sudo nginx -s reload`
2. **Redis pub/sub** -- if Redis restarted, all pub/sub subscriptions are lost. Restart the backend to re-establish:
   ```bash
   sudo systemctl restart maranatha-backend
   ```
3. **Connection limits** -- check `ulimit -n` on the backend process. Increase if needed in the systemd service file:
   ```ini
   LimitNOFILE=65536
   ```

---

## 7. High Risk Compute Taking Too Long

**Symptoms:** The periodic risk computation Celery task runs for over 10 minutes (normally completes in under 2 minutes). Other tasks back up in the queue.

**Diagnosis:**

```bash
# Check if risk task is currently running
/opt/venv/bin/celery -A celery_app inspect active | grep risk

# Check database slow queries
psql -U postgres -d maranatha_risk -c "SELECT pid, now() - pg_stat_activity.query_start AS duration, query FROM pg_stat_activity WHERE state = 'active' AND duration > interval '30 seconds' ORDER BY duration DESC;"

# Check if indexes exist
psql -U postgres -d maranatha_risk -c "\di"
```

**Resolution:**

1. **Missing indexes** -- ensure critical indexes exist:
   ```sql
   CREATE INDEX IF NOT EXISTS idx_risk_scores_student_session ON risk_scores(student_id, session_id);
   CREATE INDEX IF NOT EXISTS idx_enrollments_student ON enrollments(student_id);
   CREATE INDEX IF NOT EXISTS idx_attendance_student ON attendance(student_id);
   ```
2. **Concurrent load** -- if the risk compute runs during peak hours, reschedule it via Celery beat to run at off-peak times (e.g., 3 AM).
3. **Database connections** -- check if the connection pool is exhausted:
   ```bash
   psql -U postgres -c "SELECT count(*) FROM pg_stat_activity;"
   ```
4. **Restart if stuck:**
   ```bash
   sudo systemctl restart maranatha-celery
   ```

---

## 8. Account Lockout Issues

**Symptoms:** A user reports they cannot log in. The system returns "Account locked" after 5 failed password attempts. The lockout lasts 15 minutes.

**Diagnosis:**

```bash
# Check if account is locked
psql -U postgres -d maranatha_risk -c "SELECT matric_number, failed_login_attempts, locked_until FROM users WHERE matric_number = 'ADMIN/001';"
```

**Resolution:**

1. **Wait it out** -- the lockout expires automatically after 15 minutes.
2. **Manual unlock** -- reset the lockout fields directly:
   ```sql
   UPDATE users SET failed_login_attempts = 0, locked_until = NULL WHERE matric_number = 'ADMIN/001';
   ```
3. **Bulk unlock** (after a brute-force incident):
   ```sql
   UPDATE users SET failed_login_attempts = 0, locked_until = NULL WHERE locked_until IS NOT NULL;
   ```
4. **Investigate** -- check if the lockouts are from a brute-force attack:
   ```bash
   journalctl -u maranatha-backend -n 200 --no-pager | grep "failed login"
   ```
   If so, consider blocking the source IP at the firewall or Nginx level.

---

## 9. Dead Letter Tasks Accumulating

**Symptoms:** `GET /api/admin/dead-letters` returns a growing list of failed tasks that have not been retried or resolved. The count increases over time rather than staying near zero.

**Diagnosis:**

```bash
# Check recent dead letters via API
curl -H "Authorization: Bearer <admin-token>" http://localhost:8011/api/admin/dead-letters

# Check Celery worker logs for error context
celery -A celery_app inspect active

# Review worker log output for the failing task
journalctl -u maranatha-celery -n 100 --no-pager | grep -i "error\|exception\|dead"
```

**Resolution:**

1. **Identify the task name** -- look for patterns in the dead-letter list. If all failures share the same `task_name`, the issue is specific to that task rather than the infrastructure.
2. **Read the stored error message** -- each dead-letter record includes the exception string from the time of failure. This is the fastest path to the root cause.
3. **Fix the underlying issue** based on the error type:
   - *DB connection error* — verify `DATABASE_URL` in `.env` and that PostgreSQL is accepting connections.
   - *Missing model artifact* — see Runbook 3 (ML Model Not Loading).
   - *Bad input data* — check whether the data the task was called with is still valid (e.g., a student record was deleted between enqueue and execution).
4. **Retry safe tasks** -- if the task is idempotent and the root cause is fixed, trigger a retry via the admin interface or directly in a Celery shell:
   ```python
   from tasks.some_task import some_task
   some_task.delay(<args>)
   ```
5. **Clear resolved records** -- once the underlying issue is fixed and retries have succeeded, remove the dead-letter records through the admin interface to keep the list meaningful.

---

## 10. Model Drift Detected

**Symptoms:** A PSI > 0.2 alert appears in admin notifications. `GET /api/admin/model/drift` returns high Population Stability Index values for one or more features. Risk scores may appear inconsistent with observed student behaviour.

**Diagnosis:**

```bash
# Check which features drifted
curl -H "Authorization: Bearer <admin-token>" http://localhost:8011/api/admin/model/drift
```

Examine the response for features where `psi > 0.2`. Values between 0.1 and 0.2 indicate moderate drift; above 0.2 indicates significant population shift that may degrade model accuracy.

**Resolution:**

1. **Identify drifted features** -- focus on features with PSI > 0.2. Common culprits are `attendance_rate` (if recording failed) and `login_frequency` (if a system change altered logging behaviour).
2. **Rule out data quality issues first** -- if attendance is not being recorded or quiz data has gaps, the apparent drift is a data pipeline problem, not a genuine population shift. Fix the pipeline before retraining.
3. **If genuine population shift** -- the current student cohort behaves differently from the training population. Trigger retraining using live data:
   ```python
   from tasks.ml_tasks import retrain_model_task
   retrain_model_task.delay()
   ```
   Alternatively, from the command line:
   ```bash
   cd /opt/maranatha_risk_system/backend
   /opt/venv/bin/python -c "from ml.ml_pipeline_v2 import retrain_from_db; retrain_from_db()"
   ```
4. **Verify retraining completed** -- a new `ModelVersion` record should appear in the database, and `GET /api/admin/model` should show updated accuracy metrics and a new version timestamp.
5. **Monitor PSI over the next 2 weeks** -- check the drift endpoint every few days to confirm PSI values have returned below 0.1 with the retrained model.

---

## Quick Reference: Service Commands

```bash
# Application
sudo systemctl start|stop|restart|status maranatha-backend

# Celery
sudo systemctl start|stop|restart|status maranatha-celery
sudo systemctl start|stop|restart|status maranatha-celery-beat

# Redis
sudo systemctl start|stop|restart|status redis

# PostgreSQL
sudo systemctl start|stop|restart|status postgresql

# Nginx
sudo systemctl reload nginx
sudo nginx -t   # test config before reload

# Logs
journalctl -u maranatha-backend -f
journalctl -u maranatha-celery -f
journalctl -u maranatha-celery-beat -f
```
