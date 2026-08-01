# Tests

Backend test suite using pytest + SQLite in-memory. No external services required.

## Running Tests

```bash
cd backend
pytest tests/ -v --tb=short           # All tests with verbose output
pytest tests/test_auth.py -v          # Single file
pytest tests/ -k "test_login" -v      # Filter by name
pytest tests/ --cov=. --cov-report=term  # With coverage (requires pytest-cov)
```

## Test Infrastructure

`conftest.py` provides shared fixtures:
- `db` — SQLite in-memory session, schema created from models, torn down after each test
- `client` — TestClient with the db session injected
- `admin_user`, `student_user`, `lecturer_user` — pre-created test users with seeded data
- `admin_token`, `student_token`, `lecturer_token` — valid JWT tokens for each role

## Test Files

| File | Domain | Tests |
|------|--------|-------|
| test_auth_security.py | Authentication, lockout, MFA | ~12 |
| test_auth.py | Login flow, token refresh, logout | ~8 |
| test_quizzes.py | Quiz generation and submission | 8 |
| test_attendance.py | Attendance marking and queries | 10 |
| test_interventions.py | Intervention CRUD and conflict | 11 |
| test_notifications.py | Notification create and read | 9 |
| test_chat.py | Chat rooms and messages | 8 |
| test_risk.py | Risk computation and SHAP | ~6 |
| test_api.py | General API contract tests | ~6 |

Total: ~78 tests

## Writing New Tests

```python
from fastapi.testclient import TestClient

def test_my_endpoint(client: TestClient, student_token: str):
    response = client.get(
        "/api/students/my-courses",
        headers={"Authorization": f"Bearer {student_token}"}
    )
    assert response.status_code == 200
    data = response.json()
    assert "items" in data   # paginated response
```

**Conventions:**
- Use fixtures from conftest.py — do not create test users manually in test functions
- Test the happy path and at least one error case (401, 404, or 422) per endpoint
- Database state is isolated per test — do not depend on test ordering
