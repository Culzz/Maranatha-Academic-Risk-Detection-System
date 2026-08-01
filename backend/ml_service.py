"""
ML prediction service — loads the trained XGBoost model and provides
real-time risk prediction with SHAP explanations.

The model artifact is loaded once at import time and cached as a
module-level singleton so every request reuses the same objects.
"""

import logging
import hashlib
import json
import time
from pathlib import Path

import numpy as np

log = logging.getLogger(__name__)

# ---------------------------------------------------------------------------
# Paths
# ---------------------------------------------------------------------------
_MODEL_PATH = Path(__file__).resolve().parent.parent / "ml" / "outputs" / "xgboost_model.joblib"

# ---------------------------------------------------------------------------
# Module-level singleton
# ---------------------------------------------------------------------------
_artifact = None
_explainer = None
_prediction_cache: dict[str, tuple[float, dict]] = {}
_PRED_CACHE_TTL_SECS = 300
_PRED_CACHE_MAX = 2000

FEATURE_COLUMNS = [
    "attendance_rate", "quiz_avg", "assignment_rate", "late_submission_rate",
    "login_frequency", "consecutive_absences",
    "mood_score", "sgpa",
    "help_seeking_ratio", "peer_interaction_score",
    "material_access_rate",
    "attendance_trend", "quiz_score_trend", "login_frequency_trend",
    "submission_time_ratio", "sgpa_delta",
    "risk_velocity", "weekly_checkin_streak",
    "attendance_quiz_combined", "sgpa_absence_combined", "submission_mood_combined",
    "level", "semester", "dept_encoded",
]
FEATURE_LABELS = [
    "Attendance Rate", "Quiz Average", "Assignment Rate", "Late Submission Rate",
    "Login Frequency", "Consecutive Absences",
    "Mood Score", "SGPA",
    "Help-Seeking Ratio", "Peer Interaction Score",
    "Material Access Rate",
    "Attendance Trend", "Quiz Score Trend", "Login Frequency Trend",
    "Submission Time Ratio", "SGPA Delta",
    "Risk Velocity", "Check-In Streak",
    "Attendance x Quiz Combined", "SGPA x Absence Risk", "Submission x Mood Combined",
    "Level", "Semester", "Department",
]
RISK_THRESHOLDS = {"medium": 0.30, "high": 0.60}


def _load():
    """Load model artifact from disk (once)."""
    global _artifact, _explainer

    if _artifact is not None:
        return

    import joblib

    if not _MODEL_PATH.exists():
        log.warning("ML model not found at %s — predictions unavailable.", _MODEL_PATH)
        return

    _artifact = joblib.load(str(_MODEL_PATH))

    # Overwrite module defaults with values baked into the artifact
    global FEATURE_COLUMNS, FEATURE_LABELS, RISK_THRESHOLDS
    FEATURE_COLUMNS = _artifact.get("feature_columns", FEATURE_COLUMNS)
    FEATURE_LABELS = _artifact.get("feature_labels", FEATURE_LABELS)
    RISK_THRESHOLDS = _artifact.get("risk_thresholds", RISK_THRESHOLDS)

    model = _artifact.get("model")
    model_feature_count = getattr(model, "n_features_in_", None)
    if model_feature_count is not None and int(model_feature_count) != len(FEATURE_COLUMNS):
        log.error(
            "Model feature mismatch: model expects %s features but config has %s. Disabling model.",
            model_feature_count,
            len(FEATURE_COLUMNS),
        )
        _artifact = None
        _explainer = None
        return

    # Pre-build the SHAP explainer (expensive, do once)
    try:
        import shap
        _explainer = shap.TreeExplainer(_artifact["model"])
        log.info("SHAP TreeExplainer ready.")
    except Exception as exc:
        log.warning("SHAP explainer unavailable: %s", exc)

    log.info(
        "ML model loaded (version %s) from %s",
        _artifact.get("model_version", "unknown"),
        _MODEL_PATH,
    )


# Eagerly attempt to load on import so first request is fast.
try:
    _load()
except Exception as exc:
    log.warning("ML model could not be loaded at startup: %s", exc)


# ---------------------------------------------------------------------------
# Public API
# ---------------------------------------------------------------------------

def is_ready() -> bool:
    """Return True if the model is loaded and ready for inference."""
    return _artifact is not None


def get_model_status() -> dict:
    """Health check for the ML model."""
    return {
        "loaded": _artifact is not None,
        "shap_available": _explainer is not None,
        "version": _artifact.get("model_version") if _artifact else None,
        "feature_columns": FEATURE_COLUMNS,
        "model_path": str(_MODEL_PATH),
    }


def predict_risk(features: dict) -> dict:
    """
    Predict risk for a single student.

    Args:
        features: dict with keys matching FEATURE_COLUMNS, e.g.
                  {"sgpa": 1.8, "level": 200, "semester": 1,
                   "dept_encoded": 0, "tup": 15, "tuf": 5}

    Returns:
        {
            "risk_probability": float,
            "risk_level": "Low" | "Medium" | "High",
            "shap_explanation": {"SGPA": -0.23, "Units Failed": 0.18, ...}
        }
    """
    if _artifact is None:
        _load()
    if _artifact is None:
        raise RuntimeError("ML model is not available. Run the pipeline first.")

    model = _artifact["model"]
    now_ts = time.time()

    # Build feature vector in the correct column order
    row = []
    missing_cols = []
    for col in FEATURE_COLUMNS:
        val = features.get(col)
        if val is None:
            missing_cols.append(col)
            val = 0.0
        row.append(float(val))
    if missing_cols:
        log.warning("Predicting with fallback defaults for missing features: %s", ",".join(missing_cols))

    cache_payload = json.dumps(dict(zip(FEATURE_COLUMNS, row)), sort_keys=True, separators=(",", ":"))
    cache_key = hashlib.sha256(cache_payload.encode("utf-8")).hexdigest()
    cached = _prediction_cache.get(cache_key)
    if cached and (now_ts - cached[0]) <= _PRED_CACHE_TTL_SECS:
        return cached[1]

    X = np.array([row])

    # Predict probability of the positive class (NGS / at-risk)
    proba = model.predict_proba(X)[0]
    # proba may be [p_GS, p_NGS]
    risk_prob = float(proba[1]) if len(proba) > 1 else float(proba[0])

    # Assign risk tier
    high_t = RISK_THRESHOLDS.get("high", 0.60)
    med_t = RISK_THRESHOLDS.get("medium", 0.30)
    if risk_prob >= high_t:
        risk_level = "High"
    elif risk_prob >= med_t:
        risk_level = "Medium"
    else:
        risk_level = "Low"

    # SHAP explanation (top contributing features)
    shap_explanation = {}
    if _explainer is not None:
        try:
            shap_values = _explainer.shap_values(X)
            # Handle list output (binary classifiers)
            if isinstance(shap_values, list):
                sv = shap_values[1][0]
            else:
                sv = shap_values[0]

            # Build {label: shap_value} for top 7 by absolute magnitude
            contributions = sorted(
                zip(FEATURE_LABELS, sv),
                key=lambda x: abs(x[1]),
                reverse=True,
            )
            shap_explanation = {
                label: round(float(val), 4)
                for label, val in contributions[:7]
            }
        except Exception as exc:
            log.warning("SHAP computation failed: %s", exc)

    response = {
        "risk_probability": round(risk_prob, 4),
        "risk_level": risk_level,
        "shap_explanation": shap_explanation,
    }
    _prediction_cache[cache_key] = (now_ts, response)
    if len(_prediction_cache) > _PRED_CACHE_MAX:
        oldest_key = min(_prediction_cache.items(), key=lambda kv: kv[1][0])[0]
        _prediction_cache.pop(oldest_key, None)
    return response


def encode_department(department_name: str) -> int:
    """Encode a department name using the saved LabelEncoder."""
    if _artifact is None:
        _load()
    if _artifact is None:
        return 0

    encoder = _artifact.get("label_encoder")
    if encoder is None:
        return 0

    try:
        return int(encoder.transform([department_name])[0])
    except (ValueError, KeyError):
        # Unknown department — return median encoding to avoid bias
        n_classes = len(encoder.classes_)
        return n_classes // 2


def reload_model():
    """Force-reload the model from disk (after retraining)."""
    global _artifact, _explainer, _prediction_cache
    _artifact = None
    _explainer = None
    _prediction_cache = {}
    _load()
    log.info("ML model reloaded. Version: %s",
             _artifact.get("model_version") if _artifact else "failed")
