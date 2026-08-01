# Documentation

This directory contains the full technical documentation for the Maranatha Risk System.

---

## Documents

| File | Purpose | Audience |
|------|---------|----------|
| [ARCHITECTURE.md](ARCHITECTURE.md) | System design, component diagrams, data flow | Developers |
| [API.md](API.md) | Complete endpoint reference, auth flows, request/response payloads | Developers, Integrators |
| [RISK_ENGINE.md](RISK_ENGINE.md) | ML pipeline, 24-feature schema, model training, SHAP explainability | Data scientists, Developers |
| [AI_INTEGRATION.md](AI_INTEGRATION.md) | Claude AI features, prompt design, context window strategy, fallbacks | Developers |
| [DEPLOYMENT.md](DEPLOYMENT.md) | Dev setup, production deployment, Nginx configuration, Celery setup | DevOps, Developers |
| [RUNBOOKS.md](RUNBOOKS.md) | Operational procedures for 8 defined failure scenarios | Ops, Developers |

---

## Where to Start

If you are new to this project, read in this order:

1. [Root README.md](../README.md) — Project overview and quickstart
2. [ARCHITECTURE.md](ARCHITECTURE.md) — Understand the system design before touching code
3. [DEPLOYMENT.md](DEPLOYMENT.md) — Get the system running locally
4. [API.md](API.md) — Explore the API surface and auth flows
5. [RISK_ENGINE.md](RISK_ENGINE.md) — Understand how the ML model works and how risk scores are produced
