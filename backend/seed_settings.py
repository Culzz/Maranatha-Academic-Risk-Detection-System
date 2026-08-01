"""Seed default system settings if none exist."""
from database import SessionLocal
import app_models as models

db = SessionLocal()
current = db.query(models.SystemSetting).count()
if current == 0:
    defaults = [
        ("maintenance_mode", "false", "Enable maintenance mode to block non-admin access"),
        ("enable_ai_explanations", "true", "Enable AI-powered risk explanations using Claude"),
        ("risk_threshold_high", "0.7", "Probability threshold for High risk classification"),
        ("risk_threshold_medium", "0.4", "Probability threshold for Medium risk classification"),
        ("max_sos_per_day", "3", "Maximum SOS requests a student can send per day"),
        ("default_expiry_minutes", "30", "Default attendance session expiry in minutes"),
        ("semester_start_date", "2026-01-13", "Current semester start date"),
    ]
    for key, value, desc in defaults:
        db.add(models.SystemSetting(key=key, value=value, description=desc))
    db.commit()
    print(f"Seeded {len(defaults)} default settings")
else:
    print(f"Settings already exist ({current}), skipping seed")

# ── Upsert new settings (add missing keys without wiping existing) ──────────
NEW_SETTINGS = [
    ("email_notifications_enabled", "false", "Enable email notification delivery"),
    ("sms_notifications_enabled", "false", "Enable SMS notification delivery"),
    ("push_notifications_enabled", "true", "Enable push notification delivery"),
    ("ai_quiz_generation_enabled", "true", "Enable AI-powered quiz generation"),
    ("ai_assignment_review_enabled", "true", "Enable AI-powered assignment review feedback"),
    ("max_file_upload_mb", "10", "Maximum file upload size in megabytes"),
    ("risk_compute_day", "monday", "Day of the week for automated risk computation"),
    ("allow_student_self_study", "true", "Allow students to create self-study sessions"),
    ("guardian_portal_enabled", "false", "Enable guardian/parent portal access"),
]

new_settings_added = 0
for key, value, desc in NEW_SETTINGS:
    exists = db.query(models.SystemSetting).filter(
        models.SystemSetting.key == key
    ).first()
    if not exists:
        db.add(models.SystemSetting(key=key, value=value, description=desc))
        new_settings_added += 1
if new_settings_added:
    db.commit()
    print(f"Seeded {new_settings_added} new settings")
else:
    print("All new settings already exist, skipping")

# ── Seed intervention types (upsert — skip existing) ────────────────────────
INTERVENTION_TYPES = [
    ("academic_ref", "Academic Referral", "risk_level=High",
     "Escalated support for high-risk students."),
    ("attend_alert", "Attendance Alert", "attendance_rate<0.75",
     "Attendance has dropped below expected threshold."),
    ("mood_support", "Wellness Check-In", "mood_score<0.35",
     "Student mood indicator suggests emotional distress."),
    ("quiz_coaching", "Quiz Performance Coaching", "quiz_avg<0.40",
     "Quiz scores indicate knowledge gaps requiring targeted support."),
    ("assignment_support", "Assignment Completion Support", "assignment_rate<0.50",
     "Assignment submission rate is critically low."),
    ("peer_study_prompt", "Peer Study Group Referral", "risk_level=Medium",
     "Encourage collaborative learning with high-performing peers."),
    ("self_study_boost", "Self-Study Resource Pack", "login_frequency<0.30",
     "Low platform engagement; provide curated self-study materials."),
    ("positive_nudge", "Positive Progress Nudge", "risk_improvement",
     "Reinforce positive behavioural change with encouragement."),
    ("progress_check", "Progress Check-In", "sgpa_delta<-0.3",
     "SGPA declining; schedule progress review meeting."),
    ("financial_ref", "Financial Support Referral", "consecutive_absences>=5",
     "Prolonged absence may indicate non-academic barriers."),
    # ── New intervention types (v4) ──
    ("weekly_progress", "Weekly Progress Summary", "scheduled_weekly",
     "Weekly digest of attendance, quiz, and risk trends sent via email."),
    ("study_schedule", "AI Study Schedule", "risk_level=Medium+High",
     "AI-generated personalised study plan based on identified gaps."),
    ("early_warning", "Early Warning Alert", "risk_velocity>0.05",
     "Risk score is deteriorating rapidly; early intervention needed."),
    ("material_nudge", "Material Access Nudge", "material_access_rate<0.30",
     "Student has not accessed most course materials."),
    ("streak_celebration", "Streak Celebration", "weekly_checkin_streak>=4",
     "Celebrate consistent weekly check-in engagement."),
]

new_types = 0
for code, title, trigger, desc in INTERVENTION_TYPES:
    exists = db.query(models.InterventionType).filter(
        models.InterventionType.code == code
    ).first()
    if not exists:
        db.add(models.InterventionType(
            code=code, title=title,
            trigger_condition=trigger, description=desc,
        ))
        new_types += 1
if new_types:
    db.commit()
    print(f"Seeded {new_types} new intervention types")
else:
    print("All intervention types already exist, skipping")

db.close()
