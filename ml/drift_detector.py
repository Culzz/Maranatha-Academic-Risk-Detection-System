"""
Model drift detection using Population Stability Index (PSI).

PSI > 0.2 indicates significant feature distribution shift between
the training data and current predictions, suggesting retraining is needed.
"""

import logging
import numpy as np

log = logging.getLogger(__name__)

PSI_THRESHOLD = 0.2


def compute_psi(reference: np.ndarray, current: np.ndarray, buckets: int = 10) -> float:
    """
    Compute Population Stability Index between two distributions.

    PSI < 0.1  -- no significant shift
    PSI 0.1-0.2 -- moderate shift, monitor
    PSI > 0.2  -- significant shift, retrain recommended
    """
    if len(reference) < buckets or len(current) < buckets:
        return 0.0

    # Create bins from reference distribution
    _, edges = np.histogram(reference, bins=buckets)
    ref_hist, _ = np.histogram(reference, bins=edges)
    cur_hist, _ = np.histogram(current, bins=edges)

    # Normalize to proportions, clipping to avoid log(0)
    ref_pct = np.clip(ref_hist / ref_hist.sum(), 1e-4, None)
    cur_pct = np.clip(cur_hist / cur_hist.sum(), 1e-4, None)

    return float(np.sum((cur_pct - ref_pct) * np.log(cur_pct / ref_pct)))


def check_drift(training_features: dict, current_features: dict) -> dict:
    """
    Compare training vs current feature distributions.

    Args:
        training_features: {feature_name: np.array of training values}
        current_features:  {feature_name: np.array of current values}

    Returns:
        {feature_name: {"psi": float, "drifted": bool}}
    """
    results = {}
    for feature_name in training_features:
        if feature_name not in current_features:
            continue
        ref = np.array(training_features[feature_name], dtype=float)
        cur = np.array(current_features[feature_name], dtype=float)

        # Skip features with insufficient data
        if len(ref) < 20 or len(cur) < 20:
            continue

        psi = compute_psi(ref, cur)
        drifted = psi > PSI_THRESHOLD
        results[feature_name] = {"psi": round(psi, 4), "drifted": drifted}

        if drifted:
            log.warning("Feature '%s' shows drift: PSI=%.4f (threshold=%.2f)",
                       feature_name, psi, PSI_THRESHOLD)

    return results
