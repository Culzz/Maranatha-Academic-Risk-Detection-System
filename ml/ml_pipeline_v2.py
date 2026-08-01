"""
Maranatha University — AI-Driven Academic Risk Detection System
ML Pipeline v5: Behavioural-first model with archetype-based training data

Author  : Omeche Chimaobi Benedict
Matric  : 22/CSC/007
Degree  : B.Sc. Computer Science
Year    : 2025/2026

This pipeline trains the v5 risk model on ~1,500 synthetic student records
spanning 22 departments across 4 faculties. It uses behavioural, engagement,
trend, and academic features with archetype-based data generation that
creates realistic SGPA-behaviour overlap zones, ensuring the model learns
to rely on behavioural signals — not SGPA alone.

The pipeline also exposes a `retrain_from_db()` function that accepts
real student records from the backend for incremental model improvement.

Usage:
    python ml_pipeline_v2.py

Requirements:
    pip install xgboost shap imbalanced-learn scikit-learn pandas numpy
"""

import json
import logging
import warnings
from pathlib import Path

import joblib
import numpy as np
import pandas as pd
from sklearn.ensemble import GradientBoostingClassifier, RandomForestClassifier
from sklearn.linear_model import LogisticRegression
from sklearn.metrics import (
    classification_report,
    confusion_matrix,
    f1_score,
    make_scorer,
)
from sklearn.model_selection import StratifiedKFold
from sklearn.preprocessing import LabelEncoder
from sklearn.utils import resample

warnings.filterwarnings("ignore")

# ---------------------------------------------------------------------------
# Configuration
# All tunable parameters and paths are defined here so that the rest of the
# script requires no edits when settings change.
# ---------------------------------------------------------------------------

CONFIG = {
    # Data — v2 uses synthetic behavioural training data across 22 departments
    "data_path": "synthetic_training_data.csv",
    "output_dir": "outputs",

    # v2: No department filter — train on ALL 22 departments
    "filter_departments": None,

    # Expanded schema used for retraining and future live predictions.
    "feature_columns": [
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
    ],
    "feature_labels": [
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
    ],
    "target_column": "status",
    "positive_class": "NGS",

    # Model version
    "model_version": "5.1.0",

    # Cross-validation
    "cv_folds": 5,
    "random_state": 42,

    # Risk tier thresholds
    "risk_thresholds": {
        "medium": 0.30,
        "high": 0.60,
    },

    # XGBoost hyperparameters
    "xgb_params": {
        "n_estimators": 200,
        "learning_rate": 0.08,
        "max_depth": 4,
        "subsample": 0.8,
        "colsample_bytree": 0.8,
        "min_child_weight": 3,
        "eval_metric": "logloss",
        "random_state": 42,
        "scale_pos_weight": None,  # Set dynamically after data load.
    },
}

# ---------------------------------------------------------------------------
# Logging
# ---------------------------------------------------------------------------

logging.basicConfig(
    level=logging.INFO,
    format="%(asctime)s  %(levelname)-8s  %(message)s",
    datefmt="%H:%M:%S",
)
log = logging.getLogger(__name__)


# ---------------------------------------------------------------------------
# Pipeline Functions
# ---------------------------------------------------------------------------


def load_and_prepare_data(data_path: str) -> tuple[np.ndarray, np.ndarray, pd.DataFrame, LabelEncoder]:
    """
    Load the training dataset, encode categorical features, and construct the
    feature matrix and target vector.

    Args:
        data_path: Path to the CSV file containing student records.

    Returns:
        feature_matrix: Numpy array of shape (n_samples, n_features).
        target_vector:  Binary numpy array (0 = GS, 1 = NGS).
        dataframe:      Processed DataFrame retained for downstream analysis.
        department_encoder: Fitted LabelEncoder for the department column.
    """
    dataframe = pd.read_csv(data_path)

    # Optional department filter (None = use all departments)
    if CONFIG.get("filter_departments"):
        dataframe = dataframe[
            dataframe["department"].isin(CONFIG["filter_departments"])
        ].copy()

    # Remove personally identifiable columns not used in modelling.
    dataframe = dataframe.drop(columns=["name", "file", "matric", "faculty"], errors="ignore")

    department_encoder = LabelEncoder()
    dataframe["dept_encoded"] = department_encoder.fit_transform(
        dataframe["department"]
    )
    dataframe["target"] = (
        dataframe[CONFIG["target_column"]] == CONFIG["positive_class"]
    ).astype(int)

    feature_matrix = dataframe[CONFIG["feature_columns"]].values
    target_vector = dataframe["target"].values

    gs_count = (target_vector == 0).sum()
    ngs_count = (target_vector == 1).sum()

    log.info(
        "Dataset loaded: %d records | GS: %d  NGS: %d  Imbalance ratio: %.1f:1",
        len(dataframe),
        gs_count,
        ngs_count,
        gs_count / ngs_count,
    )

    return feature_matrix, target_vector, dataframe, department_encoder


def oversample_minority_in_fold(
    features_train: np.ndarray,
    labels_train: np.ndarray,
    random_state: int = 42,
) -> tuple[np.ndarray, np.ndarray]:
    """
    Apply minority class oversampling within a single training fold.

    Oversampling is performed after the fold split to prevent synthetic samples
    from appearing in the validation set, which would constitute data leakage.
    If the imbalanced-learn library is available, SMOTE is used. Otherwise,
    random oversampling with replacement is applied as a fallback.

    Args:
        features_train: Training features for the current fold.
        labels_train:   Training labels for the current fold.
        random_state:   Seed for reproducibility.

    Returns:
        Balanced feature matrix and label array for the training fold.
    """
    try:
        from imblearn.over_sampling import SMOTE

        min_class_count = (labels_train == 1).sum()
        k_neighbours = min(3, min_class_count - 1)
        smote = SMOTE(random_state=random_state, k_neighbors=k_neighbours)
        return smote.fit_resample(features_train, labels_train)

    except ImportError:
        features_df = pd.DataFrame(features_train)
        labels_series = pd.Series(labels_train)

        majority_features = features_df[labels_series == 0]
        minority_features = features_df[labels_series == 1]
        majority_labels = labels_series[labels_series == 0]

        target_minority_count = max(
            len(minority_features) * 3,
            len(majority_features) // 3,
        )
        minority_upsampled = resample(
            minority_features,
            replace=True,
            n_samples=target_minority_count,
            random_state=random_state,
        )
        minority_labels_upsampled = pd.Series([1] * len(minority_upsampled))

        balanced_features = pd.concat([majority_features, minority_upsampled]).values
        balanced_labels = pd.concat([majority_labels, minority_labels_upsampled]).values

        return balanced_features, balanced_labels


def train_and_evaluate_models(
    feature_matrix: np.ndarray,
    target_vector: np.ndarray,
) -> dict:
    """
    Train and evaluate three classifiers using stratified k-fold
    cross-validation. Predictions are pooled across folds before metrics
    are computed to preserve the integrity of the confusion matrix.

    The three models serve distinct roles:
        - Logistic Regression: linear baseline for performance comparison.
        - Random Forest: ensemble bagging baseline (Breiman, 2001).
        - XGBoost: primary model; gradient boosting with regularisation.

    Args:
        feature_matrix: Full feature array of shape (n_samples, n_features).
        target_vector:  Binary target array.

    Returns:
        Dictionary mapping model names to their evaluation metric dictionaries.
    """
    ngs_count = (target_vector == 1).sum()
    gs_count = (target_vector == 0).sum()
    scale_weight = gs_count / ngs_count

    # Update scale_pos_weight dynamically now that class counts are known.
    CONFIG["xgb_params"]["scale_pos_weight"] = scale_weight

    models = _build_model_candidates(scale_weight)
    cross_validator = StratifiedKFold(
        n_splits=CONFIG["cv_folds"],
        shuffle=True,
        random_state=CONFIG["random_state"],
    )

    all_results = {}

    for model_name, model in models.items():
        pooled_predictions = []
        pooled_ground_truth = []

        for train_indices, test_indices in cross_validator.split(
            feature_matrix, target_vector
        ):
            features_train = feature_matrix[train_indices]
            features_test = feature_matrix[test_indices]
            labels_train = target_vector[train_indices]
            labels_test = target_vector[test_indices]

            features_train_balanced, labels_train_balanced = (
                oversample_minority_in_fold(
                    features_train,
                    labels_train,
                    random_state=CONFIG["random_state"],
                )
            )

            model.fit(features_train_balanced, labels_train_balanced)
            fold_predictions = model.predict(features_test)

            pooled_predictions.extend(fold_predictions)
            pooled_ground_truth.extend(labels_test)

        report = classification_report(
            pooled_ground_truth,
            pooled_predictions,
            target_names=["GS", "NGS"],
            output_dict=True,
            zero_division=0,
        )
        confusion = confusion_matrix(pooled_ground_truth, pooled_predictions)

        all_results[model_name] = {
            "accuracy": round(report["accuracy"], 4),
            "ngs_precision": round(report["NGS"]["precision"], 4),
            "ngs_recall": round(report["NGS"]["recall"], 4),
            "ngs_f1": round(report["NGS"]["f1-score"], 4),
            "gs_f1": round(report["GS"]["f1-score"], 4),
            "macro_f1": round(report["macro avg"]["f1-score"], 4),
            "confusion_matrix": confusion.tolist(),
        }

        log.info(
            "%-35s  Accuracy: %.3f  NGS-F1: %.3f  Macro-F1: %.3f",
            model_name,
            report["accuracy"],
            report["NGS"]["f1-score"],
            report["macro avg"]["f1-score"],
        )

    return all_results


def train_final_model(
    feature_matrix: np.ndarray,
    target_vector: np.ndarray,
) -> object:
    """
    Retrain the primary model (XGBoost) on the full dataset after oversampling.

    The final model is trained on the balanced full dataset rather than a
    training fold, maximising minority class sensitivity prior to deployment.
    This model is used for risk scoring and SHAP explanation generation.
    It is not used for reported evaluation metrics, which are derived
    exclusively from cross-validation to prevent overfitting bias.

    Args:
        feature_matrix: Full feature array.
        target_vector:  Binary target array.

    Returns:
        Trained classifier ready for deployment inference.
    """
    features_balanced, labels_balanced = oversample_minority_in_fold(
        feature_matrix,
        target_vector,
        random_state=CONFIG["random_state"],
    )

    primary_model = _build_primary_model()
    primary_model.fit(features_balanced, labels_balanced)

    log.info(
        "Final model trained on %d samples (%d after balancing).",
        len(feature_matrix),
        len(features_balanced),
    )

    return primary_model


def compute_feature_importance(
    model: object,
    feature_labels: list[str],
) -> pd.DataFrame:
    """
    Extract and return feature importance scores from the trained model.

    For tree-based models, importance is measured by mean decrease in impurity
    across all trees. Features are sorted in descending order of importance.

    Args:
        model:          Trained tree-based classifier with feature_importances_.
        feature_labels: Human-readable feature names aligned with feature matrix
                        columns.

    Returns:
        DataFrame with columns [feature, importance] sorted by importance.
    """
    importances = model.feature_importances_
    importance_df = pd.DataFrame(
        {"feature": feature_labels, "importance": importances}
    ).sort_values("importance", ascending=False)

    log.info("Feature importance computed. Top feature: %s (%.3f)",
             importance_df.iloc[0]["feature"],
             importance_df.iloc[0]["importance"])

    return importance_df


def generate_shap_explanations(
    model: object,
    feature_matrix: np.ndarray,
    target_vector: np.ndarray,
    feature_labels: list[str],
) -> dict:
    """
    Generate SHAP (SHapley Additive exPlanations) values for the trained model.

    SHAP values are computed on the original (non-resampled) dataset to ensure
    that explanations reflect realistic feature attribution rather than
    attributions derived from synthetic minority samples. TreeExplainer is used
    as it provides exact Shapley values for tree ensembles with polynomial
    time complexity.

    For each at-risk (NGS) student, the top three contributing features are
    extracted and stored as structured output for the dashboard API.

    Args:
        model:          Trained tree-based classifier.
        feature_matrix: Original feature matrix (not resampled).
        target_vector:  Original binary target vector.
        feature_labels: Human-readable feature names.

    Returns:
        Dictionary containing global mean SHAP values and per-student
        explanations for NGS-classified students.
    """
    try:
        import shap

        explainer = shap.TreeExplainer(model)
        shap_values = explainer.shap_values(feature_matrix)

        # Handle output shape differences between XGBoost and GBM.
        if isinstance(shap_values, list):
            ngs_shap_values = shap_values[1]
        else:
            ngs_shap_values = shap_values

        mean_absolute_shap = np.abs(ngs_shap_values).mean(axis=0)

        ngs_indices = np.where(target_vector == 1)[0]
        student_explanations = []

        for index in ngs_indices:
            feature_contributions = sorted(
                zip(feature_labels, feature_matrix[index], ngs_shap_values[index]),
                key=lambda item: abs(item[2]),
                reverse=True,
            )
            top_contributors = {
                label: round(float(shap_val), 4)
                for label, _, shap_val in feature_contributions[:3]
            }
            student_explanations.append(
                {
                    "student_index": int(index),
                    "top_contributors": top_contributors,
                }
            )

        log.info(
            "SHAP explanations generated for %d NGS students.", len(ngs_indices)
        )

        return {
            "feature_names": feature_labels,
            "mean_absolute_shap": mean_absolute_shap.tolist(),
            "student_explanations": student_explanations,
        }

    except ImportError:
        log.warning("SHAP not installed. Run: pip install shap")
        log.warning("Falling back to permutation importance as a proxy.")

        from sklearn.inspection import permutation_importance

        permutation_result = permutation_importance(
            model,
            feature_matrix,
            target_vector,
            n_repeats=10,
            random_state=CONFIG["random_state"],
        )

        return {
            "feature_names": feature_labels,
            "permutation_importance": permutation_result.importances_mean.tolist(),
            "student_explanations": [],
            "note": "SHAP unavailable. Permutation importance used as proxy.",
        }


def assign_risk_tiers(
    model: object,
    feature_matrix: np.ndarray,
    dataframe: pd.DataFrame,
) -> pd.DataFrame:
    """
    Assign a risk tier (Low, Medium, High) to each student based on the
    model's predicted NGS probability.

    Threshold rationale:
        Thresholds were selected heuristically to balance sensitivity and
        specificity given the dataset's 23.5:1 class imbalance. The 0.60
        boundary for High Risk prioritises precision, minimising unnecessary
        interventions for Good Standing students. Formal optimisation using
        ROC curve analysis and the Youden Index is reported in Chapter Five.

    Args:
        model:          Trained classifier with predict_proba method.
        feature_matrix: Feature matrix for all students.
        dataframe:      Student DataFrame to receive risk columns.

    Returns:
        DataFrame with risk_probability and risk_tier columns appended.
    """
    risk_probabilities = model.predict_proba(feature_matrix)[:, 1]

    risk_tiers = np.where(
        risk_probabilities >= CONFIG["risk_thresholds"]["high"],
        "High",
        np.where(
            risk_probabilities >= CONFIG["risk_thresholds"]["medium"],
            "Medium",
            "Low",
        ),
    )

    result_df = dataframe.copy()
    result_df["risk_probability"] = risk_probabilities
    result_df["risk_tier"] = risk_tiers

    tier_counts = pd.Series(risk_tiers).value_counts()

    high_risk_true_ngs = int(
        ((risk_probabilities >= CONFIG["risk_thresholds"]["high"])
         & (dataframe["target"] == 1)).sum()
    )

    log.info(
        "Risk tiers assigned — Low: %d  Medium: %d  High: %d",
        tier_counts.get("Low", 0),
        tier_counts.get("Medium", 0),
        tier_counts.get("High", 0),
    )
    log.info(
        "High Risk precision on historical data: %d/%d correctly identified NGS.",
        high_risk_true_ngs,
        tier_counts.get("High", 0),
    )

    return result_df


def save_outputs(
    evaluation_results: dict,
    shap_output: dict,
    risk_dataframe: pd.DataFrame,
    importance_df: pd.DataFrame,
    output_dir: str,
) -> None:
    """
    Persist all pipeline outputs to disk for downstream use.

    Outputs:
        model_evaluation_results.json  — Cross-validation metrics for all models.
        shap_explanations.json         — Global and per-student SHAP values.
        maranatha_risk_scores.csv      — Student records with risk probabilities
                                         and tier assignments.
        feature_importance.csv         — Feature importance ranking.

    These files are consumed by:
        - The FastAPI backend (risk scores, SHAP explanations).
        - Chapter Five evaluation analysis (evaluation results).
        - The admin analytics dashboard (risk scores by department).

    Args:
        evaluation_results: Cross-validation results dictionary.
        shap_output:        SHAP explanations dictionary.
        risk_dataframe:     DataFrame with risk scores appended.
        importance_df:      Feature importance DataFrame.
        output_dir:         Directory path for output files.
    """
    Path(output_dir).mkdir(parents=True, exist_ok=True)

    eval_path = Path(output_dir) / "model_evaluation_results.json"
    with open(eval_path, "w") as output_file:
        json.dump(evaluation_results, output_file, indent=2)

    shap_path = Path(output_dir) / "shap_explanations.json"
    with open(shap_path, "w") as output_file:
        json.dump(shap_output, output_file, indent=2)

    output_columns = [
        "department", "level", "semester",
        "attendance_rate", "quiz_avg", "assignment_rate",
        "late_submission_rate", "login_frequency", "consecutive_absences",
        "mood_score", "sgpa", "status",
        "risk_probability", "risk_tier",
    ]
    available_columns = [
        col for col in output_columns if col in risk_dataframe.columns
    ]
    risk_path = Path(output_dir) / "maranatha_risk_scores.csv"
    risk_dataframe[available_columns].to_csv(risk_path, index=False)

    importance_path = Path(output_dir) / "feature_importance.csv"
    importance_df.to_csv(importance_path, index=False)

    log.info("All outputs saved to: %s", output_dir)


def save_model(
    model: object,
    department_encoder: LabelEncoder,
    feature_columns: list[str],
    output_dir: str,
) -> str:
    """
    Serialize the trained model, label encoder, and feature metadata to disk.

    The saved artifact is a dictionary containing all components required to
    reproduce inference without retraining: the classifier, the fitted
    department encoder, the ordered feature column list, risk tier thresholds,
    and a version string for traceability.

    Args:
        model:              Trained classifier.
        department_encoder: Fitted LabelEncoder for the department column.
        feature_columns:    List of feature column names in training order.
        output_dir:         Directory for output files.

    Returns:
        Path to the saved model file.
    """
    model_path = Path(output_dir) / "xgboost_model.joblib"
    artifact = {
        "model": model,
        "label_encoder": department_encoder,
        "feature_columns": feature_columns,
        "feature_labels": CONFIG["feature_labels"],
        "risk_thresholds": CONFIG["risk_thresholds"],
        "model_version": CONFIG.get("model_version", "3.0.0"),
    }
    joblib.dump(artifact, model_path)
    log.info("Trained model saved to: %s", model_path)
    return str(model_path)


def load_model(model_path: str = None) -> dict:
    """
    Load a previously saved model artifact from disk.

    Args:
        model_path: Path to the .joblib file. Defaults to
                    outputs/xgboost_model.joblib.

    Returns:
        Dictionary containing model, label_encoder, feature_columns,
        risk_thresholds, and model_version.

    Raises:
        FileNotFoundError: If the model file does not exist.
    """
    if model_path is None:
        model_path = str(Path(CONFIG["output_dir"]) / "xgboost_model.joblib")

    path = Path(model_path)
    if not path.exists():
        raise FileNotFoundError(f"No saved model found at {model_path}")

    artifact = joblib.load(model_path)
    log.info(
        "Model loaded from: %s (version %s)",
        model_path,
        artifact.get("model_version", "unknown"),
    )
    return artifact


def retrain_from_db(
    records: list[dict],
    output_dir: str = None,
) -> dict:
    """
    Retrain the model using real student records from the database.

    Called by the backend retrain endpoint. Accepts a list of dicts with
    the expanded behavioural feature set + 'status' (GS/NGS) + 'department'.

    Args:
        records:    List of dicts, each containing the configured feature columns
                    plus 'status' and 'department'.
        output_dir: Where to save the new model. Defaults to CONFIG output_dir.

    Returns:
        Dict with evaluation metrics and the new model version string.
    """
    if output_dir is None:
        output_dir = CONFIG["output_dir"]

    df = pd.DataFrame(records)

    # Encode departments
    department_encoder = LabelEncoder()
    df["dept_encoded"] = department_encoder.fit_transform(df["department"])
    df["target"] = (df["status"] == CONFIG["positive_class"]).astype(int)

    feature_matrix = df[CONFIG["feature_columns"]].values
    target_vector = df["target"].values

    gs_count = (target_vector == 0).sum()
    ngs_count = (target_vector == 1).sum()

    if ngs_count == 0:
        raise ValueError("Cannot retrain: no NGS records in the dataset.")

    log.info(
        "Retrain dataset: %d records | GS: %d  NGS: %d",
        len(df), gs_count, ngs_count,
    )

    # Train and evaluate
    evaluation_results = train_and_evaluate_models(feature_matrix, target_vector)
    final_model = train_final_model(feature_matrix, target_vector)

    # Bump version: read current, increment minor
    try:
        current = load_model(str(Path(output_dir) / "xgboost_model.joblib"))
        old_version = current.get("model_version", "3.0.0")
        parts = old_version.split(".")
        parts[-1] = str(int(parts[-1]) + 1)
        new_version = ".".join(parts)
    except (FileNotFoundError, Exception):
        new_version = "3.0.0"

    CONFIG["model_version"] = new_version

    save_model(
        model=final_model,
        department_encoder=department_encoder,
        feature_columns=CONFIG["feature_columns"],
        output_dir=output_dir,
    )

    importance_df = compute_feature_importance(final_model, CONFIG["feature_labels"])
    importance_path = Path(output_dir) / "feature_importance.csv"
    importance_df.to_csv(importance_path, index=False)

    # Save evaluation results
    eval_path = Path(output_dir) / "model_evaluation_results.json"
    with open(eval_path, "w") as f:
        json.dump(evaluation_results, f, indent=2)

    xgb_metrics = evaluation_results.get("XGBoost", {})

    log.info("Retrain complete. New model version: %s", new_version)

    return {
        "model_version": new_version,
        "training_records": len(df),
        "gs_count": int(gs_count),
        "ngs_count": int(ngs_count),
        "accuracy": xgb_metrics.get("accuracy", 0),
        "ngs_f1": xgb_metrics.get("ngs_f1", 0),
        "macro_f1": xgb_metrics.get("macro_f1", 0),
    }


def print_summary(evaluation_results: dict, risk_dataframe: pd.DataFrame) -> None:
    """
    Print a concise summary of pipeline results to stdout.

    This summary is intended to provide a quick verification of pipeline
    completion and key metrics. Full results are available in the output files.

    Args:
        evaluation_results: Cross-validation results from all models.
        risk_dataframe:     DataFrame with risk tiers assigned.
    """
    print("\nPipeline complete.")
    print(f"Dataset: {len(risk_dataframe)} records | "
          f"Departments: {risk_dataframe['department'].nunique()}")

    print("\nCross-validation results (5-fold stratified):")
    print(f"  {'Model':<35}  {'Accuracy':>8}  {'NGS F1':>8}  {'Macro F1':>9}")
    print(f"  {'-'*35}  {'-'*8}  {'-'*8}  {'-'*9}")
    for model_name, metrics in evaluation_results.items():
        print(
            f"  {model_name:<35}  "
            f"{metrics['accuracy']:>8.3f}  "
            f"{metrics['ngs_f1']:>8.3f}  "
            f"{metrics['macro_f1']:>9.3f}"
        )

    print("\nRisk tier distribution:")
    high_risk_flags = (risk_dataframe["risk_tier"] == "High").sum()
    high_risk_ngs = ((risk_dataframe["risk_tier"] == "High") & (risk_dataframe["target"] == 1)).sum()
    med_risk_flags = (risk_dataframe["risk_tier"] == "Medium").sum()
    low_risk_flags = (risk_dataframe["risk_tier"] == "Low").sum()

    print(f"  Low Risk:            {low_risk_flags:4d} students")
    print(f"  Medium Risk:         {med_risk_flags:4d} students")
    print(f"  High Risk (>=0.60):  {high_risk_flags:4d} students | {high_risk_ngs} actual NGS")

    if "sgpa" in risk_dataframe.columns:
        print("\nSGPA threshold comparison:")
        sgpa_2_flags = (risk_dataframe["sgpa"] < 2.0).sum()
        sgpa_2_ngs = ((risk_dataframe["sgpa"] < 2.0) & (risk_dataframe["target"] == 1)).sum()
        print(f"  SGPA < 2.0 threshold: {sgpa_2_flags:3d} flagged | {sgpa_2_ngs} NGS correctly identified")
    print()


# ---------------------------------------------------------------------------
# Private helpers
# ---------------------------------------------------------------------------


def _build_primary_model() -> object:
    """Instantiate the primary XGBoost classifier with config parameters."""
    try:
        from xgboost import XGBClassifier

        params = {k: v for k, v in CONFIG["xgb_params"].items()
                  if v is not None}
        params.pop("use_label_encoder", None)
        return XGBClassifier(**params)

    except ImportError:
        log.warning(
            "XGBoost not installed. Using GradientBoostingClassifier as equivalent."
        )
        return GradientBoostingClassifier(
            n_estimators=CONFIG["xgb_params"]["n_estimators"],
            learning_rate=CONFIG["xgb_params"]["learning_rate"],
            max_depth=CONFIG["xgb_params"]["max_depth"],
            subsample=CONFIG["xgb_params"]["subsample"],
            random_state=CONFIG["xgb_params"]["random_state"],
        )


def _build_model_candidates(scale_pos_weight: float) -> dict:
    """
    Construct the three model candidates for comparative evaluation.

    Returns an ordered dictionary to ensure consistent iteration and
    reporting order throughout the evaluation.
    """
    return {
        "Logistic Regression (Baseline)": LogisticRegression(
            random_state=CONFIG["random_state"],
            max_iter=1000,
            class_weight="balanced",
        ),
        "Random Forest": RandomForestClassifier(
            n_estimators=100,
            random_state=CONFIG["random_state"],
            class_weight="balanced",
        ),
        "XGBoost": _build_primary_model(),
    }


# ---------------------------------------------------------------------------
# Entry point
# ---------------------------------------------------------------------------


def main() -> None:
    """
    Orchestrate the full ML pipeline from data loading to output persistence.

    Execution order:
        1. Load and prepare the historical dataset.
        2. Train and evaluate all three classifiers via cross-validation.
        3. Train the final deployment model on the full balanced dataset.
        4. Compute feature importance from the final model.
        5. Generate SHAP explanations for individual student predictions.
        6. Assign risk tiers based on predicted probabilities.
        7. Save all outputs for backend integration and evaluation analysis.
    """
    log.info("Starting Maranatha academic risk detection pipeline.")

    feature_matrix, target_vector, dataframe, department_encoder = load_and_prepare_data(
        CONFIG["data_path"]
    )

    evaluation_results = train_and_evaluate_models(feature_matrix, target_vector)

    final_model = train_final_model(feature_matrix, target_vector)

    save_model(
        model=final_model,
        department_encoder=department_encoder,
        feature_columns=CONFIG["feature_columns"],
        output_dir=CONFIG["output_dir"],
    )

    importance_df = compute_feature_importance(
        final_model, CONFIG["feature_labels"]
    )

    shap_output = generate_shap_explanations(
        final_model,
        feature_matrix,
        target_vector,
        CONFIG["feature_labels"],
    )

    risk_dataframe = assign_risk_tiers(final_model, feature_matrix, dataframe)

    save_outputs(
        evaluation_results,
        shap_output,
        risk_dataframe,
        importance_df,
        CONFIG["output_dir"],
    )

    print_summary(evaluation_results, risk_dataframe)

    log.info("Pipeline completed successfully.")


if __name__ == "__main__":
    main()
