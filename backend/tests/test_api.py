"""
API infrastructure tests for the Maranatha Risk System.

Covers:
  1.  Health check endpoint (GET /)
  2.  CORS headers on preflight requests
  3.  Security headers (X-Content-Type-Options, X-Frame-Options, etc.)
  4.  Request ID header is injected on every response
  5.  404 for unknown routes
  6.  GZip compression on large responses
  7.  Docs endpoint availability in debug mode
  8.  Departments public endpoint
"""


# ============================================================================
# 1. HEALTH CHECK
# ============================================================================


class TestHealthCheck:
    """Verify GET / returns system health status."""

    def test_health_check_returns_200(self, client):
        """Health check endpoint responds with 200."""
        res = client.get("/")
        assert res.status_code == 200

    def test_health_check_response_structure(self, client):
        """Health check returns required fields: status, database, ml_model."""
        res = client.get("/")
        data = res.json()
        assert "status" in data
        assert "database" in data
        assert "ml_model" in data
        assert "application" in data
        assert "version" in data

    def test_health_check_database_connected(self, client):
        """Health check reports database as connected when DB is available."""
        res = client.get("/")
        data = res.json()
        assert data["database"] == "connected"


# ============================================================================
# 2. CORS HEADERS
# ============================================================================


class TestCORSHeaders:
    """Verify CORS middleware is properly configured."""

    def test_cors_allows_configured_origin(self, client):
        """Responses to requests from allowed origins include CORS headers."""
        res = client.get("/", headers={
            "Origin": "http://localhost:5173",
        })
        assert res.status_code == 200
        assert "access-control-allow-origin" in res.headers
        assert res.headers["access-control-allow-origin"] == "http://localhost:5173"

    def test_cors_preflight_options(self, client):
        """OPTIONS preflight request returns CORS headers."""
        res = client.options("/api/auth/login", headers={
            "Origin": "http://localhost:5173",
            "Access-Control-Request-Method": "POST",
            "Access-Control-Request-Headers": "Content-Type, Authorization",
        })
        assert res.status_code == 200
        assert "access-control-allow-origin" in res.headers
        assert "access-control-allow-methods" in res.headers

    def test_cors_credentials_allowed(self, client):
        """CORS allows credentials (cookies, Authorization header)."""
        res = client.get("/", headers={
            "Origin": "http://localhost:5173",
        })
        allow_creds = res.headers.get("access-control-allow-credentials", "")
        assert allow_creds.lower() == "true"


# ============================================================================
# 3. SECURITY HEADERS
# ============================================================================


class TestSecurityHeaders:
    """Verify SecurityHeadersMiddleware injects all required headers."""

    def test_x_content_type_options(self, client):
        """X-Content-Type-Options: nosniff is present."""
        res = client.get("/")
        assert res.headers.get("X-Content-Type-Options") == "nosniff"

    def test_x_frame_options(self, client):
        """X-Frame-Options: DENY is present."""
        res = client.get("/")
        assert res.headers.get("X-Frame-Options") == "DENY"

    def test_x_xss_protection(self, client):
        """X-XSS-Protection header is present."""
        res = client.get("/")
        assert res.headers.get("X-XSS-Protection") == "1; mode=block"

    def test_referrer_policy(self, client):
        """Referrer-Policy header is present."""
        res = client.get("/")
        assert res.headers.get("Referrer-Policy") == "strict-origin-when-cross-origin"

    def test_permissions_policy(self, client):
        """Permissions-Policy header is present."""
        res = client.get("/")
        pp = res.headers.get("Permissions-Policy", "")
        assert "camera=()" in pp
        assert "microphone=()" in pp

    def test_content_security_policy(self, client):
        """Content-Security-Policy header is present with key directives."""
        res = client.get("/")
        csp = res.headers.get("Content-Security-Policy", "")
        assert "default-src 'self'" in csp
        assert "frame-ancestors 'none'" in csp


# ============================================================================
# 4. REQUEST ID
# ============================================================================


class TestRequestID:
    """Verify X-Request-ID is injected by the logging middleware."""

    def test_request_id_present(self, client):
        """Every response includes an X-Request-ID header."""
        res = client.get("/")
        assert "X-Request-ID" in res.headers
        assert len(res.headers["X-Request-ID"]) == 8  # uuid hex[:8]

    def test_request_id_unique(self, client):
        """Consecutive requests get different request IDs."""
        r1 = client.get("/")
        r2 = client.get("/")
        assert r1.headers["X-Request-ID"] != r2.headers["X-Request-ID"]


# ============================================================================
# 5. 404 FOR UNKNOWN ROUTES
# ============================================================================


class TestNotFound:
    """Verify unknown routes return 404."""

    def test_unknown_api_route(self, client):
        """GET to a non-existent API path returns 404."""
        res = client.get("/api/this-route-does-not-exist")
        assert res.status_code == 404

    def test_unknown_root_route(self, client):
        """GET to a non-existent root path returns 404."""
        res = client.get("/definitely-not-a-route")
        assert res.status_code == 404


# ============================================================================
# 6. DOCS ENDPOINT
# ============================================================================


class TestDocsAvailability:
    """Verify docs endpoint availability in debug mode."""

    def test_docs_available_in_debug(self, client):
        """GET /docs returns 200 when DEBUG=True."""
        res = client.get("/docs")
        assert res.status_code == 200

    def test_redoc_available_in_debug(self, client):
        """GET /redoc returns 200 when DEBUG=True."""
        res = client.get("/redoc")
        assert res.status_code == 200


# ============================================================================
# 7. PUBLIC ENDPOINTS
# ============================================================================


class TestPublicEndpoints:
    """Verify public endpoints are accessible without authentication."""

    def test_departments_endpoint_accessible(self, client):
        """GET /api/auth/departments returns 200 (public)."""
        res = client.get("/api/auth/departments")
        assert res.status_code == 200
        assert isinstance(res.json(), list)

    def test_forgot_password_accessible(self, client):
        """POST /api/auth/forgot-password is publicly accessible."""
        res = client.post("/api/auth/forgot-password", json={
            "identifier": "anyone@example.com",
        })
        assert res.status_code == 200


# ============================================================================
# 8. JSON ERROR RESPONSES
# ============================================================================


class TestErrorResponses:
    """Verify API errors are returned as structured JSON."""

    def test_401_returns_json(self, client):
        """401 errors include a JSON body with detail field."""
        res = client.get("/api/students/me")
        assert res.status_code == 401
        data = res.json()
        assert "detail" in data

    def test_422_validation_error_returns_json(self, client):
        """Pydantic validation errors (422) include structured details."""
        res = client.post("/api/auth/register", json={
            "email": "not-an-email",
            "full_name": "X",
            "password": "x",
            "role": "student",
            "matric_number": "22/CSC/090",
        })
        assert res.status_code == 422
        data = res.json()
        assert "detail" in data
