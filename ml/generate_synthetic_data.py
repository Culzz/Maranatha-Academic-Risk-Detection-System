"""
Maranatha University -- Synthetic Academic Records Generator v5.1

Generates ~1,500 plausible synthetic student records across 22 departments
in 4 faculties, with 24 features matching the v5 risk model schema.

Design philosophy:
    Real students are messy.  This generator produces data with:
    1. Realistic SGPA overlap between GS/NGS (40% of students in the grey zone)
    2. Archetype blending (students are 60-100% one archetype, rest from another)
    3. Contradictory cases (~8% of records deliberately violate expected patterns)
    4. Measurement noise (simulates missing check-ins, inconsistent engagement)
    5. No single feature is a reliable shortcut to classification

    Target feature importance distribution (approximate):
        Tier 1 (10-20% each): SGPA, late submission, attendance patterns
        Tier 2 (5-12% each):  SGPA delta, material access, consecutive absences
        Tier 3 (3-7% each):   Mood, assignment rate, check-in, peer interaction
        Tier 4 (1-4% each):   Trends, login, help-seeking, combos
        Tier 5 (~0%):         Level, semester, department (structural, not behavioural)

Usage:
    python generate_synthetic_data.py

Output:
    synthetic_training_data.csv
"""

import numpy as np
import pandas as pd
from pathlib import Path

np.random.seed(42)

# ── Faculty / Department Configuration ──────────────────────────────────────

DEPARTMENTS = {
    # FNAS
    "Computer Science":        {"faculty": "FNAS", "code": "CSC", "ngs_rate": 0.10, "n": 80, "difficulty": 0.7},
    "Cybersecurity":           {"faculty": "FNAS", "code": "CYB", "ngs_rate": 0.10, "n": 70, "difficulty": 0.7},
    "Software Engineering":    {"faculty": "FNAS", "code": "SEN", "ngs_rate": 0.10, "n": 70, "difficulty": 0.7},
    "Computer Engineering":    {"faculty": "FNAS", "code": "CPE", "ngs_rate": 0.10, "n": 70, "difficulty": 0.75},
    "Mathematics":             {"faculty": "FNAS", "code": "MTH", "ngs_rate": 0.12, "n": 60, "difficulty": 0.8},
    "Biochemistry":            {"faculty": "FNAS", "code": "BCH", "ngs_rate": 0.11, "n": 60, "difficulty": 0.65},
    "Information Technology":  {"faculty": "FNAS", "code": "INF", "ngs_rate": 0.09, "n": 60, "difficulty": 0.6},
    "Industrial Chemistry":    {"faculty": "FNAS", "code": "ICH", "ngs_rate": 0.11, "n": 60, "difficulty": 0.65},
    "Physics and Electronics": {"faculty": "FNAS", "code": "PHY", "ngs_rate": 0.12, "n": 60, "difficulty": 0.75},
    # FAMSS
    "Economics":                          {"faculty": "FAMSS", "code": "ECO", "ngs_rate": 0.12, "n": 60, "difficulty": 0.5},
    "Accounting":                         {"faculty": "FAMSS", "code": "ACC", "ngs_rate": 0.12, "n": 60, "difficulty": 0.55},
    "Business Administration":            {"faculty": "FAMSS", "code": "BUS", "ngs_rate": 0.12, "n": 60, "difficulty": 0.45},
    "Criminology and Security Studies":   {"faculty": "FAMSS", "code": "CSS", "ngs_rate": 0.12, "n": 55, "difficulty": 0.45},
    "English and Communication":          {"faculty": "FAMSS", "code": "ENG", "ngs_rate": 0.10, "n": 55, "difficulty": 0.4},
    "History and International Relations": {"faculty": "FAMSS", "code": "HIS", "ngs_rate": 0.10, "n": 55, "difficulty": 0.4},
    # FBMS
    "Nursing":                       {"faculty": "FBMS", "code": "NRS", "ngs_rate": 0.14, "n": 60, "difficulty": 0.85},
    "Doctor of Physiotherapy":       {"faculty": "FBMS", "code": "PHT", "ngs_rate": 0.14, "n": 60, "difficulty": 0.85},
    "Public Health":                 {"faculty": "FBMS", "code": "PBH", "ngs_rate": 0.12, "n": 55, "difficulty": 0.7},
    "Health Information Management": {"faculty": "FBMS", "code": "HIM", "ngs_rate": 0.12, "n": 55, "difficulty": 0.6},
    # FES
    "Architecture":        {"faculty": "FES", "code": "ARC", "ngs_rate": 0.11, "n": 55, "difficulty": 0.75},
    "Quantity Surveying":  {"faculty": "FES", "code": "QUS", "ngs_rate": 0.10, "n": 55, "difficulty": 0.6},
    "Estate Management":   {"faculty": "FES", "code": "EST", "ngs_rate": 0.10, "n": 55, "difficulty": 0.5},
}

DEPT_MAX_LEVEL = {
    "Architecture": 500,
    "Computer Engineering": 500,
    "Doctor of Physiotherapy": 600,
    "Nursing": 600,
}

LEVEL_RISK_MODIFIER = {
    100: 1.0, 200: 0.85, 300: 1.1, 400: 1.2, 500: 1.15, 600: 1.1,
}


def _get_levels_and_probs(dept_name: str):
    """Return level list and probability weights for a department."""
    max_level = DEPT_MAX_LEVEL.get(dept_name, 400)
    all_weights = {100: 0.38, 200: 0.27, 300: 0.18, 400: 0.10, 500: 0.05, 600: 0.02}
    levels = [lv for lv in sorted(all_weights) if lv <= max_level]
    raw = [all_weights[lv] for lv in levels]
    total = sum(raw)
    return levels, [w / total for w in raw]


# ── Archetype Parameter Sets ────────────────────────────────────────────────
# Each archetype is a dict of (mean, std) tuples for all behavioural features.
# The generator blends two archetypes per student for realistic messiness.

ARCHETYPES = {
    "classic_fail": {
        "sgpa": (1.30, 0.45), "ef": (0.30, 0.16),
        "mood": (0.35, 0.20), "late_sub": (0.48, 0.22),
        "help_seek": (0.20, 0.18), "peer": (0.18, 0.16),
        "att_trend": (-0.12, 0.18), "quiz_trend": (-0.10, 0.18),
        "login_trend": (-0.08, 0.18), "sgpa_delta": (-0.30, 0.38),
        "risk_vel": (0.04, 0.06), "checkin": (0.24, 0.22),
        "material": (0.25, 0.20),
    },
    "silent_slider": {
        "sgpa": (2.20, 0.55), "ef": (0.38, 0.18),
        "mood": (0.42, 0.22), "late_sub": (0.35, 0.22),
        "help_seek": (0.18, 0.16), "peer": (0.20, 0.17),
        "att_trend": (-0.12, 0.18), "quiz_trend": (-0.10, 0.18),
        "login_trend": (-0.08, 0.18), "sgpa_delta": (-0.22, 0.35),
        "risk_vel": (0.03, 0.05), "checkin": (0.30, 0.24),
        "material": (0.35, 0.22),
    },
    "burnout": {
        "sgpa": (1.80, 0.55), "ef": (0.40, 0.18),
        "mood": (0.28, 0.18), "late_sub": (0.44, 0.24),
        "help_seek": (0.22, 0.18), "peer": (0.24, 0.18),
        "att_trend": (-0.08, 0.18), "quiz_trend": (-0.10, 0.18),
        "login_trend": (-0.06, 0.18), "sgpa_delta": (-0.20, 0.35),
        "risk_vel": (0.03, 0.05), "checkin": (0.20, 0.20),
        "material": (0.36, 0.22),
    },
    "strong_gs": {
        "sgpa": (3.30, 0.60), "ef": (0.68, 0.18),
        "mood": (0.68, 0.18), "late_sub": (0.14, 0.14),
        "help_seek": (0.45, 0.22), "peer": (0.48, 0.22),
        "att_trend": (0.06, 0.16), "quiz_trend": (0.05, 0.16),
        "login_trend": (0.04, 0.16), "sgpa_delta": (0.12, 0.32),
        "risk_vel": (-0.02, 0.05), "checkin": (0.52, 0.26),
        "material": (0.62, 0.24),
    },
    "late_bloomer": {
        "sgpa": (2.10, 0.50), "ef": (0.62, 0.18),
        "mood": (0.58, 0.20), "late_sub": (0.18, 0.16),
        "help_seek": (0.48, 0.24), "peer": (0.44, 0.24),
        "att_trend": (0.14, 0.16), "quiz_trend": (0.12, 0.16),
        "login_trend": (0.08, 0.16), "sgpa_delta": (0.25, 0.35),
        "risk_vel": (-0.03, 0.05), "checkin": (0.48, 0.26),
        "material": (0.56, 0.24),
    },
    "coasting_gs": {
        "sgpa": (2.65, 0.55), "ef": (0.52, 0.20),
        "mood": (0.54, 0.20), "late_sub": (0.22, 0.18),
        "help_seek": (0.32, 0.22), "peer": (0.35, 0.22),
        "att_trend": (0.02, 0.16), "quiz_trend": (0.01, 0.16),
        "login_trend": (0.00, 0.16), "sgpa_delta": (0.04, 0.28),
        "risk_vel": (-0.01, 0.05), "checkin": (0.36, 0.26),
        "material": (0.45, 0.24),
    },
}


def _sample_param(archetype: dict, key: str) -> float:
    """Sample a single feature from an archetype's (mean, std) pair."""
    mu, sigma = archetype[key]
    return np.random.normal(mu, sigma)


def _blend_archetypes(primary: str, secondary: str, blend: float) -> dict:
    """Create a blended parameter set: (1-blend)*primary + blend*secondary.
    blend is typically 0.0-0.4, meaning 60-100% primary archetype."""
    p = ARCHETYPES[primary]
    s = ARCHETYPES[secondary]
    blended = {}
    for key in p:
        p_val = _sample_param(p, key)
        s_val = _sample_param(s, key)
        blended[key] = (1.0 - blend) * p_val + blend * s_val
    return blended


def _build_record(params: dict, level: int, semester: int,
                  difficulty: float) -> dict:
    """Build a single student record from blended archetype parameters.

    Adds measurement noise, level/semester effects, and computes
    derived interaction features.
    """
    sgpa = params["sgpa"]
    ef = params["ef"]

    # ── Measurement noise (simulates real-world data quality issues) ────
    # 15% of students have inconsistent check-in data
    measurement_noise = np.random.normal(0, 0.08)

    # ── Core engagement features ────────────────────────────────────────
    attendance_rate = np.clip(ef + np.random.normal(0.02, 0.12), 0.0, 1.0)
    quiz_avg = np.clip(ef + np.random.normal(-0.02, 0.14), 0.0, 1.0)
    assignment_rate = np.clip(ef + np.random.normal(0.04, 0.12), 0.0, 1.0)
    login_frequency = np.clip(ef + np.random.normal(-0.06, 0.14), 0.0, 1.0)
    submission_time_ratio = np.clip(ef + np.random.normal(-0.04, 0.15), 0.0, 1.0)

    # ── Consecutive absences (Poisson) ──────────────────────────────────
    absence_lambda = max(0.1, (1.0 - attendance_rate)) * (3.5 if ef < 0.4 else 1.8)
    consecutive_absences = min(int(np.random.poisson(absence_lambda)), 15)

    # ── Behavioural features from archetype blend ───────────────────────
    mood_score = np.clip(params["mood"] + measurement_noise * 0.5, 0.0, 1.0)
    late_sub_rate = np.clip(params["late_sub"] + np.random.normal(0, 0.08), 0.0, 1.0)
    help_seeking = np.clip(params["help_seek"] + np.random.normal(0, 0.10), 0.0, 1.0)
    peer_interaction = np.clip(params["peer"] + np.random.normal(0, 0.10), 0.0, 1.0)
    material_access = np.clip(params["material"] + np.random.normal(0, 0.08), 0.0, 1.0)

    # ── Trends ──────────────────────────────────────────────────────────
    att_trend = np.clip(params["att_trend"] + np.random.normal(0, 0.06), -0.5, 0.5)
    quiz_trend = np.clip(params["quiz_trend"] + np.random.normal(0, 0.06), -0.5, 0.5)
    login_trend = np.clip(params["login_trend"] + np.random.normal(0, 0.06), -0.5, 0.5)

    # ── Academic momentum ───────────────────────────────────────────────
    sgpa_delta = np.clip(params["sgpa_delta"] + np.random.normal(0, 0.08), -2.0, 2.0)
    risk_velocity = np.clip(params["risk_vel"] + np.random.normal(0, 0.03), -0.15, 0.15)
    checkin_streak = np.clip(params["checkin"] + measurement_noise, 0.0, 1.0)

    # ── Level-aware adjustments ─────────────────────────────────────────
    level_mod = LEVEL_RISK_MODIFIER.get(level, 1.0)
    difficulty_effect = (difficulty - 0.5) * 0.06 * level_mod

    # Freshers: slightly more inconsistent data
    if level == 100:
        checkin_streak += np.random.normal(-0.04, 0.06)
        consecutive_absences = max(0, consecutive_absences + np.random.choice([0, 0, 1]))
    elif level >= 300:
        att_trend -= difficulty_effect * 0.5
        quiz_trend -= difficulty_effect * 0.5

    # ── Semester 2 effects ──────────────────────────────────────────────
    if semester == 2:
        mood_score = np.clip(mood_score - 0.04, 0.0, 1.0)
        late_sub_rate = np.clip(late_sub_rate + 0.03, 0.0, 1.0)

    # ── SGPA final clamp ────────────────────────────────────────────────
    sgpa = np.clip(sgpa, 0.10, 5.00)

    # ── Interaction features (non-linear combinations + noise) ──────────
    attendance_quiz_combined = np.clip(
        attendance_rate * quiz_avg + np.random.normal(0, 0.10), 0.0, 1.0)
    sgpa_absence_combined = np.clip(
        max(0, (1 - min(sgpa / 3.5, 1.0))) * min(consecutive_absences / 8.0, 1.0)
        + np.random.normal(0, 0.06), 0.0, 1.0)
    submission_mood_combined = np.clip(
        (1.0 - late_sub_rate) * mood_score + np.random.normal(0, 0.12), 0.0, 1.0)

    return {
        "sgpa":                round(sgpa, 2),
        "attendance_rate":     round(np.clip(attendance_rate, 0, 1), 3),
        "quiz_avg":            round(np.clip(quiz_avg, 0, 1), 3),
        "assignment_rate":     round(np.clip(assignment_rate, 0, 1), 3),
        "login_frequency":     round(np.clip(login_frequency, 0, 1), 3),
        "consecutive_absences": max(0, consecutive_absences),
        "mood_score":          round(np.clip(mood_score, 0, 1), 3),
        "late_submission_rate": round(np.clip(late_sub_rate, 0, 1), 3),
        "help_seeking_ratio":  round(np.clip(help_seeking, 0, 1), 3),
        "peer_interaction_score": round(np.clip(peer_interaction, 0, 1), 3),
        "material_access_rate": round(np.clip(material_access, 0, 1), 3),
        "attendance_trend":    round(np.clip(att_trend, -0.5, 0.5), 3),
        "quiz_score_trend":    round(np.clip(quiz_trend, -0.5, 0.5), 3),
        "login_frequency_trend": round(np.clip(login_trend, -0.5, 0.5), 3),
        "submission_time_ratio": round(np.clip(submission_time_ratio, 0, 1), 3),
        "sgpa_delta":          round(np.clip(sgpa_delta, -2, 2), 2),
        "risk_velocity":       round(np.clip(risk_velocity, -0.15, 0.15), 4),
        "weekly_checkin_streak": round(np.clip(checkin_streak, 0, 1), 3),
        "attendance_quiz_combined":  round(attendance_quiz_combined, 3),
        "sgpa_absence_combined":     round(sgpa_absence_combined, 3),
        "submission_mood_combined":  round(submission_mood_combined, 3),
    }


# ── Department-Level Generator ──────────────────────────────────────────────

# Contradictory case generators: violate expected patterns

def _gen_contradictory_ngs(level, semester, difficulty):
    """NGS who looks engaged — high effort but still fails.
    Simulates students who try hard but lack foundational knowledge."""
    params = _blend_archetypes("strong_gs", "burnout", 0.45)
    # Override SGPA to be low despite good engagement
    params["sgpa"] = np.clip(np.random.normal(1.65, 0.40), 0.50, 2.30)
    params["sgpa_delta"] = np.clip(np.random.normal(-0.25, 0.25), -1.5, 0.2)
    return _build_record(params, level, semester, difficulty)


def _gen_contradictory_gs(level, semester, difficulty):
    """GS who looks disengaged — low effort but still passes.
    Simulates naturally talented students who coast on ability."""
    params = _blend_archetypes("classic_fail", "coasting_gs", 0.45)
    # Override SGPA to be adequate despite poor engagement
    params["sgpa"] = np.clip(np.random.normal(2.60, 0.50), 2.00, 3.50)
    params["sgpa_delta"] = np.clip(np.random.normal(0.05, 0.20), -0.5, 1.0)
    return _build_record(params, level, semester, difficulty)


def generate_department(dept_name: str, config: dict) -> pd.DataFrame:
    """Generate synthetic records for a single department using blended archetypes."""
    n = config["n"]
    ngs_rate = config["ngs_rate"]
    difficulty = config.get("difficulty", 0.5)

    n_ngs = max(4, int(round(n * ngs_rate)))
    n_gs = n - n_ngs

    dept_levels, dept_probs = _get_levels_and_probs(dept_name)

    # Reserve ~8% of each class for contradictory cases
    n_contra_ngs = max(1, int(round(n_ngs * 0.08)))
    n_contra_gs = max(1, int(round(n_gs * 0.08)))
    n_normal_ngs = n_ngs - n_contra_ngs
    n_normal_gs = n_gs - n_contra_gs

    rows = []

    # Secondary archetype pools for blending
    ngs_secondaries = ["silent_slider", "burnout", "classic_fail"]
    gs_secondaries = ["strong_gs", "coasting_gs", "late_bloomer"]

    # ── Normal NGS students (blended archetypes) ────────────────────────
    ngs_primaries = (
        ["classic_fail"] * int(round(n_normal_ngs * 0.38)) +
        ["silent_slider"] * int(round(n_normal_ngs * 0.35)) +
        ["burnout"] * max(1, n_normal_ngs - int(round(n_normal_ngs * 0.38))
                          - int(round(n_normal_ngs * 0.35)))
    )
    np.random.shuffle(ngs_primaries)

    for primary in ngs_primaries:
        level = int(np.random.choice(dept_levels, p=dept_probs))
        semester = int(np.random.randint(1, 3))
        # Blend with a random secondary archetype (0-35% blend)
        secondary = np.random.choice([a for a in ngs_secondaries if a != primary])
        blend = np.random.uniform(0.0, 0.35)
        params = _blend_archetypes(primary, secondary, blend)
        record = _build_record(params, level, semester, difficulty)
        record.update({"department": dept_name, "faculty": config["faculty"],
                       "level": level, "semester": semester, "status": "NGS"})
        rows.append(record)

    # ── Contradictory NGS (engaged but failing) ─────────────────────────
    for _ in range(n_contra_ngs):
        level = int(np.random.choice(dept_levels, p=dept_probs))
        semester = int(np.random.randint(1, 3))
        record = _gen_contradictory_ngs(level, semester, difficulty)
        record.update({"department": dept_name, "faculty": config["faculty"],
                       "level": level, "semester": semester, "status": "NGS"})
        rows.append(record)

    # ── Normal GS students (blended archetypes) ─────────────────────────
    gs_primaries = (
        ["strong_gs"] * int(round(n_normal_gs * 0.48)) +
        ["late_bloomer"] * int(round(n_normal_gs * 0.22)) +
        ["coasting_gs"] * max(1, n_normal_gs - int(round(n_normal_gs * 0.48))
                              - int(round(n_normal_gs * 0.22)))
    )
    np.random.shuffle(gs_primaries)

    for primary in gs_primaries:
        level = int(np.random.choice(dept_levels, p=dept_probs))
        semester = int(np.random.randint(1, 3))
        secondary = np.random.choice([a for a in gs_secondaries if a != primary])
        blend = np.random.uniform(0.0, 0.35)
        params = _blend_archetypes(primary, secondary, blend)
        record = _build_record(params, level, semester, difficulty)
        record.update({"department": dept_name, "faculty": config["faculty"],
                       "level": level, "semester": semester, "status": "GS"})
        rows.append(record)

    # ── Contradictory GS (disengaged but passing) ───────────────────────
    for _ in range(n_contra_gs):
        level = int(np.random.choice(dept_levels, p=dept_probs))
        semester = int(np.random.randint(1, 3))
        record = _gen_contradictory_gs(level, semester, difficulty)
        record.update({"department": dept_name, "faculty": config["faculty"],
                       "level": level, "semester": semester, "status": "GS"})
        rows.append(record)

    return pd.DataFrame(rows)


# ── Main ────────────────────────────────────────────────────────────────────


def main():
    all_frames = []

    print("Generating synthetic training data (v5.1 — blended archetypes)...")
    print(f"{'Department':<45} {'N':>5}  {'NGS':>4}")
    print("-" * 60)

    for dept_name, config in DEPARTMENTS.items():
        df = generate_department(dept_name, config)
        all_frames.append(df)
        ngs_count = (df["status"] == "NGS").sum()
        print(f"  {dept_name:<43} {len(df):>5}  {ngs_count:>4}")

    combined = pd.concat(all_frames, ignore_index=True)
    combined = combined.sample(frac=1, random_state=42).reset_index(drop=True)

    out_path = Path(__file__).parent / "synthetic_training_data.csv"
    combined.to_csv(out_path, index=False)

    # ── Summary ─────────────────────────────────────────────────────────
    total = len(combined)
    n_gs = (combined["status"] == "GS").sum()
    n_ngs = (combined["status"] == "NGS").sum()

    print(f"\n{'=' * 60}")
    print(f"Total records:    {total}")
    print(f"Departments:      {combined['department'].nunique()}")
    print(f"Faculties:        {combined['faculty'].nunique()}")
    print(f"GS:               {n_gs}")
    print(f"NGS:              {n_ngs}")
    print(f"Imbalance ratio:  {n_gs / max(n_ngs, 1):.1f}:1")

    gs_df = combined[combined["status"] == "GS"]
    ngs_df = combined[combined["status"] == "NGS"]
    overlap_gs = ((gs_df["sgpa"] >= 1.5) & (gs_df["sgpa"] <= 2.8)).sum()
    overlap_ngs = ((ngs_df["sgpa"] >= 1.5) & (ngs_df["sgpa"] <= 2.8)).sum()
    print(f"\nSGPA overlap zone (1.5-2.8):")
    print(f"  GS students in zone:  {overlap_gs} ({overlap_gs/n_gs*100:.1f}%)")
    print(f"  NGS students in zone: {overlap_ngs} ({overlap_ngs/n_ngs*100:.1f}%)")

    print(f"\nNGS by faculty:")
    print(combined[combined["status"] == "NGS"].groupby("faculty").size().to_string())

    feature_cols = [
        "attendance_rate", "quiz_avg", "assignment_rate", "late_submission_rate",
        "login_frequency", "consecutive_absences", "mood_score", "sgpa",
        "help_seeking_ratio", "peer_interaction_score", "material_access_rate",
        "attendance_trend", "quiz_score_trend", "login_frequency_trend",
        "submission_time_ratio", "sgpa_delta",
        "risk_velocity", "weekly_checkin_streak",
        "attendance_quiz_combined", "sgpa_absence_combined", "submission_mood_combined",
    ]

    print(f"\nFeature means (GS vs NGS):")
    print(f"  {'Feature':<30} {'GS':>8} {'NGS':>8} {'Delta':>8}")
    print(f"  {'-'*30} {'-'*8} {'-'*8} {'-'*8}")
    for col in feature_cols:
        gs_mean = gs_df[col].mean()
        ngs_mean = ngs_df[col].mean()
        delta = gs_mean - ngs_mean
        print(f"  {col:<30} {gs_mean:>8.3f} {ngs_mean:>8.3f} {delta:>+8.3f}")

    print(f"\nSaved: {out_path}")


if __name__ == "__main__":
    main()
