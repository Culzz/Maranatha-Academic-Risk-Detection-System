"""
Seed Risk Scores — Inserts balanced RiskScore records using existing
StudentResult data (from seed_wave4.py) to populate all dashboards.

Run:  python seed_risk.py   (from the backend/ directory, after seed_wave4.py)

Expected output:
  ~25% High risk  (NGS / SGPA < 2.0)
  ~35% Medium risk (SGPA 2.0–3.0)
  ~40% Low risk   (SGPA > 3.0)
"""
import random
import sys
import os
from datetime import datetime, timezone
from decimal import Decimal

sys.path.insert(0, os.path.dirname(__file__))

from database import SessionLocal, engine, Base
import app_models as models

Base.metadata.create_all(bind=engine)
db = SessionLocal()

print("=" * 60)
print("  RISK SCORE SEED — Balanced High / Medium / Low")
print("=" * 60)


# ── Get active session ───────────────────────────────────────────────────────

session = db.query(models.AcademicSession).filter(
    models.AcademicSession.is_active == True
).first()
if not session:
    print("ERROR: No active academic session. Run seed_data.py first.")
    db.close()
    sys.exit(1)

print(f"  Session: {session.session_label} (id={session.id})")

# Get ML model version (read artifact directly — avoids heavy ml_service import)
model_version = "4.0.0"
try:
    import joblib
    from pathlib import Path
    _model_path = Path(__file__).resolve().parent.parent / "ml" / "outputs" / "xgboost_model.joblib"
    if _model_path.exists():
        _artifact = joblib.load(str(_model_path))
        model_version = _artifact.get("model_version", "4.0.0")
        del _artifact
        print(f"  Model version: {model_version}")
except Exception:
    print(f"  Model version: {model_version} (default — artifact not loaded)")

# ── Clear existing risk scores for this session ──────────────────────────────

deleted = db.query(models.RiskScore).filter(
    models.RiskScore.session_id == session.id
).delete()
db.flush()
print(f"  Cleared {deleted} existing risk scores")

# ── Load enrollments + student results ───────────────────────────────────────

enrollments = db.query(models.Enrollment).filter(
    models.Enrollment.session_id == session.id
).all()

results_map = {}
for r in db.query(models.StudentResult).filter(
    models.StudentResult.session_id == session.id
).all():
    results_map[str(r.student_id)] = r

print(f"  Enrollments: {len(enrollments)}")
print(f"  Students with results: {len(results_map)}")

# ── SHAP explanation templates per risk tier ──────────────────────────────────

random.seed(42)

SHAP_HIGH = [
    {"SGPA": -0.38, "Submission x Mood Combined": -0.24, "Mood Score": -0.12,
     "Risk Velocity": 0.08, "SGPA Delta": -0.07, "Late Submission Rate": 0.06,
     "Consecutive Absences": 0.05},
    {"SGPA": -0.32, "Submission x Mood Combined": -0.18, "SGPA x Absence Risk": 0.10,
     "Mood Score": -0.09, "SGPA Delta": -0.08, "Risk Velocity": 0.07,
     "Help-Seeking Ratio": -0.05},
    {"SGPA": -0.41, "Submission x Mood Combined": -0.15, "Mood Score": -0.11,
     "Consecutive Absences": 0.09, "Late Submission Rate": 0.08,
     "SGPA Delta": -0.06, "Assignment Rate": -0.05},
]

SHAP_MEDIUM = [
    {"SGPA": -0.14, "Submission x Mood Combined": -0.09, "Mood Score": -0.06,
     "Risk Velocity": 0.04, "SGPA Delta": -0.04, "Quiz Average": -0.03,
     "Attendance Rate": -0.03},
    {"SGPA": -0.12, "Submission x Mood Combined": -0.08, "SGPA x Absence Risk": 0.05,
     "Mood Score": -0.05, "Peer Interaction Score": -0.04,
     "Late Submission Rate": 0.03, "Assignment Rate": -0.03},
    {"SGPA": -0.16, "Mood Score": -0.07, "Submission x Mood Combined": -0.06,
     "Attendance Trend": -0.04, "SGPA Delta": -0.03,
     "Consecutive Absences": 0.04, "Risk Velocity": 0.03},
]

SHAP_LOW = [
    {"SGPA": 0.22, "Submission x Mood Combined": 0.14, "Mood Score": 0.08,
     "Peer Interaction Score": 0.05, "SGPA Delta": 0.04,
     "Quiz Average": 0.03, "Assignment Rate": 0.03},
    {"SGPA": 0.18, "Submission x Mood Combined": 0.12, "Mood Score": 0.07,
     "Check-In Streak": 0.05, "Attendance Rate": 0.04,
     "Assignment Rate": 0.03, "Help-Seeking Ratio": 0.02},
    {"SGPA": 0.25, "Submission x Mood Combined": 0.10, "Mood Score": 0.09,
     "Peer Interaction Score": 0.04, "SGPA Delta": 0.05,
     "Attendance Rate": 0.03, "Quiz Average": 0.02},
]


def jitter_shap(template):
    """Add small random noise to SHAP values for variation."""
    return {k: round(v + random.uniform(-0.02, 0.02), 4) for k, v in template.items()}


# ── Generate risk scores ─────────────────────────────────────────────────────

count_high = 0
count_medium = 0
count_low = 0
total = 0
now = datetime.now(timezone.utc)

for enrollment in enrollments:
    sid = str(enrollment.student_id)
    result = results_map.get(sid)
    if not result:
        continue

    sgpa = float(result.sgpa) if result.sgpa else 0.0
    status = (result.status or "").strip().upper()

    # Determine risk tier based on academic standing.
    # Since SGPA distribution is skewed (62% have 4.0+), we use a
    # probability-based approach to redistribute some strong students
    # into Medium risk, simulating engagement-based risk factors the
    # ML model would detect (low attendance, few logins, etc.)
    if status == "NGS" or sgpa < 2.0:
        # Definitely high risk — weak academic standing
        prob = round(random.uniform(0.70, 0.92), 4)
        level = "High"
        shap = jitter_shap(random.choice(SHAP_HIGH))
        count_high += 1
    elif sgpa < 3.5:
        # Borderline — medium risk
        prob = round(random.uniform(0.40, 0.69), 4)
        level = "Medium"
        shap = jitter_shap(random.choice(SHAP_MEDIUM))
        count_medium += 1
    elif random.random() < 0.30:
        # 30% of strong students get medium risk
        # (simulates low engagement despite good grades)
        prob = round(random.uniform(0.40, 0.60), 4)
        level = "Medium"
        shap = jitter_shap(random.choice(SHAP_MEDIUM))
        count_medium += 1
    else:
        # Remaining strong students — low risk
        prob = round(random.uniform(0.05, 0.39), 4)
        level = "Low"
        shap = jitter_shap(random.choice(SHAP_LOW))
        count_low += 1

    db.add(models.RiskScore(
        student_id=enrollment.student_id,
        course_id=enrollment.course_id,
        session_id=session.id,
        week_number=1,
        risk_level=level,
        risk_probability=Decimal(str(prob)),
        previous_risk_level=None,
        shap_explanation=shap,
        model_version=model_version,
        confidence_score=Decimal(str(round(random.uniform(0.75, 0.95), 4))),
        computed_at=now,
    ))
    total += 1

db.commit()
db.close()

print(f"\n  Total risk scores seeded: {total}")
print(f"  High risk:   {count_high}  ({round(count_high / max(total, 1) * 100)}%)")
print(f"  Medium risk: {count_medium}  ({round(count_medium / max(total, 1) * 100)}%)")
print(f"  Low risk:    {count_low}  ({round(count_low / max(total, 1) * 100)}%)")
print("=" * 60)
