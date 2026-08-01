# ML Model — Maranatha Academic Risk Detection System

## Overview

XGBoost binary classifier (v4.0.0) predicting whether a student is academically at risk. The model is trained on 24 behavioural and academic features extracted from database records. The training set consists of 1,330 synthetic student-session records with SMOTE applied to balance class distribution. The trained model is loaded into memory by `ml_service.py` on backend startup and serves predictions synchronously. SHAP `TreeExplainer` provides per-prediction feature attributions for interpretability.

Model accuracy: 0.997 (cross-validated). F1 on the Not-Graduate-Suitable class: 0.980. Top feature by importance: SGPA (gain share 0.521).

---

## Files

| File | Purpose |
|------|---------|
| `ml_pipeline_v2.py` | Full training pipeline. Loads data, applies SMOTE, trains XGBoost, computes SHAP, writes all artifacts to `outputs/`. Run directly or trigger via `retrain_model_task`. |
| `generate_synthetic_data.py` | Generates the 1,330-record synthetic training dataset and writes it to `synthetic_training_data.csv`. |
| `drift_detector.py` | PSI-based model drift detection. Compares current live feature distributions against the training baseline. |
| `synthetic_training_data.csv` | Training data. Synthetic — does not contain real student records. |
| `outputs/xgboost_model.joblib` | Trained model artifact. This file is loaded by the backend on startup. |
| `outputs/model_evaluation_results.json` | Cross-validated accuracy, precision, recall, F1, and confusion matrix from the last training run. |
| `outputs/shap_explanations.json` | Pre-computed SHAP values generated during training for reference and visualisation. |
| `outputs/feature_importance.csv` | Per-feature XGBoost gain importance from the last training run. |

---

## Running the Training Pipeline

```bash
# From the project root with the virtual environment active
cd ml
python generate_synthetic_data.py   # Optional: regenerate the synthetic training data
python ml_pipeline_v2.py            # Train the model and write artifacts to outputs/
```

Running `generate_synthetic_data.py` before training is only necessary if you want to regenerate the dataset from scratch. If `synthetic_training_data.csv` already exists, you can run the pipeline directly.

After training completes, the backend will pick up the new `outputs/xgboost_model.joblib` on its next startup (or on Celery-triggered reload — see below).

---

## Retraining from the Backend

The backend can trigger a retraining run without stopping the service:

```python
from worker_tasks import retrain_model_task
retrain_model_task.delay()
```

This is also exposed through the admin UI at the Model Admin page. The Celery task:

1. Acquires a Redis distributed lock to prevent concurrent retraining runs.
2. Extracts the latest feature snapshots from the database.
3. Runs the full pipeline in `ml_pipeline_v2.py`.
4. Replaces the model artifact at `outputs/xgboost_model.joblib`.
5. Signals `ml_service.py` to reload the model into memory.
6. On failure at any step, writes a `DeadLetterTask` record and sends an alert to admins.

---

## Model Features (24 total)

**Academic performance (5)**

| Feature | Description |
|---------|-------------|
| SGPA | Current semester GPA |
| CGPA | Cumulative GPA across all semesters |
| Failed courses | Count of courses failed in current session |
| Outstanding courses | Count of unresolved carry-over courses |
| Year of study | Academic year (1–5) |

**Attendance (4)**

| Feature | Description |
|---------|-------------|
| Attendance rate | Percentage of scheduled classes attended |
| Excused absences | Count of absences marked excused |
| Consecutive absences | Longest unbroken run of missed classes |
| Attendance trend | Directional change vs. prior semester |

**Assessments (5)**

| Feature | Description |
|---------|-------------|
| Quiz submission rate | Proportion of available quizzes attempted |
| Assignment submission rate | Proportion of assignments submitted |
| Average quiz score | Mean score across submitted quizzes |
| Average assignment score | Mean score across submitted assignments |
| Late submissions | Count of submissions made after the deadline |

**Digital engagement (5)**

| Feature | Description |
|---------|-------------|
| Material access rate | Proportion of available materials opened |
| Read depth | Average scroll depth across material reading sessions |
| Chat activity | Count of chat messages sent in the period |
| Office hours attendance | Count of lecturer office hours sessions attended |
| Check-in count | Count of system check-ins completed |

**Behavioural signals (5)**

| Feature | Description |
|---------|-------------|
| SOS count | Number of SOS distress signals sent |
| Intervention compliance | Rate of assigned interventions completed |
| Peer study sessions | Count of peer study group participations |
| Journal entries | Count of reflective journal entries submitted |
| Composite engagement | Weighted aggregate of all engagement signals |

---

## Drift Detection

`ml/drift_detector.py` computes Population Stability Index (PSI) by comparing the distribution of each feature in recent live predictions against the distribution in the training data.

| PSI Range | Interpretation | Action |
|-----------|---------------|--------|
| < 0.10 | Stable | No action required |
| 0.10 – 0.20 | Moderate distributional shift | Monitor closely |
| > 0.20 | Significant drift | Retraining is triggered automatically |

The drift check runs weekly via Celery Beat (the `weekly-drift-check` job). Results from the most recent check are accessible at `GET /api/admin/model/drift`.

---

## Interpreting Model Outputs

Each call to `ml_service.predict()` returns a dict with four fields:

| Field | Type | Description |
|-------|------|-------------|
| `risk_score` | float [0.0–1.0] | Probability that the student is Not-Graduate-Suitable. Higher = more risk. |
| `risk_tier` | string | Bucketed label: `high_risk`, `at_risk`, or `on_track` |
| `shap_values` | dict | Maps each feature name to its Shapley value. Positive values increase predicted risk; negative values decrease it. |
| `student_state` | string | One of: `CRITICAL`, `STRUGGLING`, `STABLE`, `IMPROVING`, `RECOVERING`, `THRIVING` — assigned by the Student State Engine (`classify_student_state()`) based on risk score trajectory and feature signals. |

SHAP values are the primary basis for the plain-language "Next Best Action" suggestions shown to students on their Overview page. The backend reads the top positive-contribution features and maps them to human-readable recommendations.
