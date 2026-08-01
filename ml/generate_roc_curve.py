"""
Generate ROC Curve from Trained XGBoost Model
For Chapter 4 - Model Evaluation
"""
import json
import joblib
import numpy as np
import pandas as pd
import matplotlib.pyplot as plt
from sklearn.metrics import roc_curve, auc, roc_auc_score
from pathlib import Path

# Configuration
CONFIG = {
    "data_path": "synthetic_training_data.csv",
    "model_path": "outputs/xgboost_model.joblib",
    "output_dir": "outputs",
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
    "target_column": "status",
    "positive_class": "NGS",
}

# Load data
print("Loading training data...")
df = pd.read_csv(CONFIG["data_path"])

# Prepare features and target
X = df[CONFIG["feature_columns"]]
y = (df[CONFIG["target_column"]] == CONFIG["positive_class"]).astype(int)

print(f"Data shape: {X.shape}")
print(f"Risk cases (NGS): {y.sum()} / {len(y)}")

# Load trained model
print("Loading trained model...")
model = joblib.load(CONFIG["model_path"])

# Get predictions and probabilities
print("Generating predictions...")
y_pred = model.predict(X)
y_pred_proba = model.predict_proba(X)[:, 1]  # Probability of positive class

# Calculate ROC curve
print("Calculating ROC curve...")
fpr, tpr, thresholds = roc_curve(y, y_pred_proba)
roc_auc = auc(fpr, tpr)

print(f"\nROC AUC Score: {roc_auc:.4f}")
print(f"\nFPR values (first 10): {fpr[:10]}")
print(f"TPR values (first 10): {tpr[:10]}")

# Save ROC data to JSON for reference
roc_data = {
    "auc_score": float(roc_auc),
    "fpr": fpr.tolist(),
    "tpr": tpr.tolist(),
    "thresholds": thresholds.tolist(),
    "n_samples": int(len(y)),
    "n_positive": int(y.sum()),
    "n_negative": int((1-y).sum()),
}

with open(f"{CONFIG['output_dir']}/roc_curve_data.json", "w") as f:
    json.dump(roc_data, f, indent=2)
print(f"\n✓ ROC data saved to outputs/roc_curve_data.json")

# Create high-quality ROC curve plot
plt.figure(figsize=(10, 8))
plt.plot(fpr, tpr, color='#2E86AB', lw=2.5, label=f'ROC curve (AUC = {roc_auc:.4f})')
plt.plot([0, 1], [0, 1], color='gray', lw=1.5, linestyle='--', label='Random classifier')

plt.xlim([0.0, 1.0])
plt.ylim([0.0, 1.05])
plt.xlabel('False Positive Rate', fontsize=12, fontweight='bold')
plt.ylabel('True Positive Rate', fontsize=12, fontweight='bold')
plt.title('ROC Curve - XGBoost Risk Model\nMaranatha University Academic Risk Detection', 
          fontsize=14, fontweight='bold', pad=20)
plt.legend(loc="lower right", fontsize=11, framealpha=0.95)
plt.grid(alpha=0.3, linestyle='--')
plt.tight_layout()

# Save plot
output_file = f"{CONFIG['output_dir']}/roc_curve.png"
plt.savefig(output_file, dpi=300, bbox_inches='tight')
print(f"✓ ROC curve plot saved to outputs/roc_curve.png (300 DPI)")

# Also save as PDF for thesis
pdf_file = f"{CONFIG['output_dir']}/roc_curve.pdf"
plt.savefig(pdf_file, bbox_inches='tight')
print(f"✓ ROC curve saved as PDF to outputs/roc_curve.pdf")

print("\n" + "="*60)
print("ROC Curve Generation Complete!")
print("="*60)
print(f"\nFor your thesis Chapter 4, use:")
print(f"  - Image: outputs/roc_curve.png (high-res)")
print(f"  - PDF: outputs/roc_curve.pdf")
print(f"  - Data: outputs/roc_curve_data.json")
