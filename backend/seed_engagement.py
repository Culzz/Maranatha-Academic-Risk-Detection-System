"""
seed_engagement.py — Populate engagement_metrics with realistic data matching
risk scores, and backfill feature_snapshot + student_state on risk_scores.

Run AFTER seed_data.py, seed_wave4.py, seed_settings.py, seed_risk.py:
    python seed_engagement.py

This ensures every student dashboard page has data: engagement bars, feature
charts, risk cards with SHAP + state, attendance records, etc.
"""
import random
import sys
import os
import math
from datetime import datetime, timezone, timedelta, date
from decimal import Decimal

sys.path.insert(0, os.path.dirname(__file__))

import logging
logging.getLogger("sqlalchemy.engine").setLevel(logging.WARNING)
os.environ["DATABASE_ECHO"] = "0"

from database import SessionLocal, engine, Base
import app_models as models

Base.metadata.create_all(bind=engine)
db = SessionLocal()

print("=" * 60)
print("  ENGAGEMENT + FEATURE SNAPSHOT SEED")
print("=" * 60)

# ── Get active session ─────────────────────────────────────────────────────
session = db.query(models.AcademicSession).filter(
    models.AcademicSession.is_active == True
).first()
if not session:
    print("ERROR: No active session. Run seed_data.py first.")
    sys.exit(1)

print(f"  Session: {session.session_label} (id={session.id})")

# ── Load data ──────────────────────────────────────────────────────────────
enrollments = db.query(models.Enrollment).filter(
    models.Enrollment.session_id == session.id
).all()

risk_scores = db.query(models.RiskScore).filter(
    models.RiskScore.session_id == session.id
).all()

students = db.query(models.User).filter(models.User.role == "student").all()
student_map = {str(s.id): s for s in students}

# Build risk map: (student_id, course_id) -> RiskScore
risk_map = {}
for rs in risk_scores:
    key = (str(rs.student_id), rs.course_id)
    risk_map[key] = rs

print(f"  Enrollments: {len(enrollments)}")
print(f"  Risk scores: {len(risk_scores)}")
print(f"  Students:    {len(students)}")

random.seed(42)

# ── ML feature names (24 features matching v5.1.0) ────────────────────────
FEATURE_NAMES = [
    "sgpa", "mood_score", "login_frequency", "submission_time_ratio",
    "attendance_trend", "sgpa_delta", "help_seeking_ratio", "checkin_streak",
    "submission_mood_combined", "sgpa_absence_risk", "attendance_rate",
    "assignment_rate", "peer_interaction_score", "login_frequency_trend",
    "quiz_score_trend", "risk_velocity", "material_access_rate",
    "late_submission_rate", "quiz_average", "attendance_quiz_combined",
    "department", "level", "consecutive_absences", "semester",
]

# ── Student state definitions ──────────────────────────────────────────────
# CRITICAL/STRUGGLING/STABLE/IMPROVING/RECOVERING/THRIVING
def classify_state(risk_level, prob, sgpa):
    if risk_level == "High":
        if prob >= 0.85:
            return "CRITICAL"
        return "STRUGGLING"
    elif risk_level == "Medium":
        if sgpa >= 2.5:
            return "STABLE"
        return random.choice(["RECOVERING", "STABLE"])
    else:  # Low
        if sgpa >= 3.5:
            return "THRIVING"
        return random.choice(["IMPROVING", "STABLE"])


def gen_feature_snapshot(risk_level, sgpa):
    """Generate realistic 24-feature snapshot matching risk tier."""
    if risk_level == "High":
        snap = {
            "sgpa": round(max(0.4, sgpa + random.uniform(-0.3, 0.1)), 2),
            "mood_score": round(random.uniform(0.15, 0.45), 3),
            "login_frequency": round(random.uniform(0.10, 0.40), 3),
            "submission_time_ratio": round(random.uniform(0.20, 0.50), 3),
            "attendance_trend": round(random.uniform(-0.25, -0.02), 3),
            "sgpa_delta": round(random.uniform(-0.60, -0.05), 3),
            "help_seeking_ratio": round(random.uniform(0.05, 0.30), 3),
            "checkin_streak": round(random.uniform(0.0, 0.35), 3),
            "submission_mood_combined": round(random.uniform(0.10, 0.35), 3),
            "sgpa_absence_risk": round(random.uniform(0.50, 0.90), 3),
            "attendance_rate": round(random.uniform(0.30, 0.65), 3),
            "assignment_rate": round(random.uniform(0.20, 0.55), 3),
            "peer_interaction_score": round(random.uniform(0.05, 0.30), 3),
            "login_frequency_trend": round(random.uniform(-0.20, -0.01), 3),
            "quiz_score_trend": round(random.uniform(-0.20, 0.0), 3),
            "risk_velocity": round(random.uniform(0.01, 0.10), 4),
            "material_access_rate": round(random.uniform(0.10, 0.40), 3),
            "late_submission_rate": round(random.uniform(0.30, 0.70), 3),
            "quiz_average": round(random.uniform(0.15, 0.45), 3),
            "attendance_quiz_combined": round(random.uniform(0.10, 0.35), 3),
            "department": random.randint(0, 21),
            "level": random.choice([200, 300, 400]),
            "consecutive_absences": random.randint(3, 8),
            "semester": 1,
        }
    elif risk_level == "Medium":
        snap = {
            "sgpa": round(max(1.0, sgpa + random.uniform(-0.2, 0.2)), 2),
            "mood_score": round(random.uniform(0.35, 0.60), 3),
            "login_frequency": round(random.uniform(0.30, 0.60), 3),
            "submission_time_ratio": round(random.uniform(0.40, 0.70), 3),
            "attendance_trend": round(random.uniform(-0.10, 0.05), 3),
            "sgpa_delta": round(random.uniform(-0.30, 0.10), 3),
            "help_seeking_ratio": round(random.uniform(0.15, 0.45), 3),
            "checkin_streak": round(random.uniform(0.20, 0.50), 3),
            "submission_mood_combined": round(random.uniform(0.30, 0.55), 3),
            "sgpa_absence_risk": round(random.uniform(0.25, 0.55), 3),
            "attendance_rate": round(random.uniform(0.55, 0.80), 3),
            "assignment_rate": round(random.uniform(0.45, 0.75), 3),
            "peer_interaction_score": round(random.uniform(0.15, 0.45), 3),
            "login_frequency_trend": round(random.uniform(-0.08, 0.05), 3),
            "quiz_score_trend": round(random.uniform(-0.08, 0.05), 3),
            "risk_velocity": round(random.uniform(-0.02, 0.05), 4),
            "material_access_rate": round(random.uniform(0.30, 0.60), 3),
            "late_submission_rate": round(random.uniform(0.15, 0.40), 3),
            "quiz_average": round(random.uniform(0.40, 0.65), 3),
            "attendance_quiz_combined": round(random.uniform(0.30, 0.55), 3),
            "department": random.randint(0, 21),
            "level": random.choice([200, 300, 400]),
            "consecutive_absences": random.randint(1, 4),
            "semester": 1,
        }
    else:  # Low
        snap = {
            "sgpa": round(min(5.0, sgpa + random.uniform(-0.1, 0.3)), 2),
            "mood_score": round(random.uniform(0.55, 0.85), 3),
            "login_frequency": round(random.uniform(0.50, 0.85), 3),
            "submission_time_ratio": round(random.uniform(0.60, 0.90), 3),
            "attendance_trend": round(random.uniform(-0.02, 0.15), 3),
            "sgpa_delta": round(random.uniform(-0.05, 0.30), 3),
            "help_seeking_ratio": round(random.uniform(0.30, 0.65), 3),
            "checkin_streak": round(random.uniform(0.40, 0.75), 3),
            "submission_mood_combined": round(random.uniform(0.50, 0.80), 3),
            "sgpa_absence_risk": round(random.uniform(0.05, 0.30), 3),
            "attendance_rate": round(random.uniform(0.75, 0.98), 3),
            "assignment_rate": round(random.uniform(0.70, 0.95), 3),
            "peer_interaction_score": round(random.uniform(0.30, 0.65), 3),
            "login_frequency_trend": round(random.uniform(0.0, 0.12), 3),
            "quiz_score_trend": round(random.uniform(0.0, 0.10), 3),
            "risk_velocity": round(random.uniform(-0.05, 0.01), 4),
            "material_access_rate": round(random.uniform(0.55, 0.90), 3),
            "late_submission_rate": round(random.uniform(0.02, 0.18), 3),
            "quiz_average": round(random.uniform(0.60, 0.90), 3),
            "attendance_quiz_combined": round(random.uniform(0.55, 0.85), 3),
            "department": random.randint(0, 21),
            "level": random.choice([200, 300, 400]),
            "consecutive_absences": random.randint(0, 2),
            "semester": 1,
        }
    return snap


# ══════════════════════════════════════════════════════════════════════════════
# 1. BACKFILL feature_snapshot + student_state on existing RiskScores
# ══════════════════════════════════════════════════════════════════════════════
print("\n1. Backfilling feature_snapshot + student_state on risk scores...")

# Get SGPA per student from StudentResult
sgpa_map = {}
for r in db.query(models.StudentResult).filter(
    models.StudentResult.session_id == session.id
).all():
    sgpa_map[str(r.student_id)] = float(r.sgpa) if r.sgpa else 2.0

updated_rs = 0
for rs in risk_scores:
    sid = str(rs.student_id)
    sgpa = sgpa_map.get(sid, 2.0)
    rs.feature_snapshot = gen_feature_snapshot(rs.risk_level, sgpa)
    rs.student_state = classify_state(rs.risk_level, float(rs.risk_probability), sgpa)
    updated_rs += 1

db.flush()
print(f"   -> Updated {updated_rs} risk scores with feature_snapshot + student_state")


# ══════════════════════════════════════════════════════════════════════════════
# 2. SEED ENGAGEMENT METRICS (one per enrollment per week, weeks 1-4)
# ══════════════════════════════════════════════════════════════════════════════
print("\n2. Seeding engagement metrics...")

# Clear existing
deleted_em = db.query(models.EngagementMetric).filter(
    models.EngagementMetric.session_id == session.id
).delete()
db.flush()
print(f"   Cleared {deleted_em} existing engagement metrics")

now = datetime.now(timezone.utc)
em_count = 0
WEEKS = [1, 2, 3, 4]

for enrollment in enrollments:
    sid = str(enrollment.student_id)
    key = (sid, enrollment.course_id)
    rs = risk_map.get(key)
    risk_level = rs.risk_level if rs else "Medium"
    sgpa = sgpa_map.get(sid, 2.5)

    for week in WEEKS:
        # Generate engagement data consistent with risk tier
        if risk_level == "High":
            att_rate = round(random.uniform(0.30, 0.65), 2)
            quiz_avg = round(random.uniform(15, 45), 2)
            sub_rate = round(random.uniform(0.20, 0.55), 2)
            logins = random.randint(2, 8)
            study_mins = random.randint(15, 90)
            eng_score = round(random.uniform(0.15, 0.40), 4)
            classes_held = random.randint(3, 5)
            classes_att = max(1, int(classes_held * att_rate))
            quizzes_avail = random.randint(1, 3)
            quizzes_att = max(0, quizzes_avail - random.randint(0, 2))
            assign_due = random.randint(1, 3)
            assign_sub = max(0, int(assign_due * sub_rate))
            on_time = max(0, assign_sub - random.randint(0, 1))
        elif risk_level == "Medium":
            att_rate = round(random.uniform(0.55, 0.82), 2)
            quiz_avg = round(random.uniform(40, 68), 2)
            sub_rate = round(random.uniform(0.50, 0.80), 2)
            logins = random.randint(5, 15)
            study_mins = random.randint(60, 180)
            eng_score = round(random.uniform(0.40, 0.65), 4)
            classes_held = random.randint(3, 5)
            classes_att = max(1, int(classes_held * att_rate))
            quizzes_avail = random.randint(1, 3)
            quizzes_att = max(0, quizzes_avail - random.randint(0, 1))
            assign_due = random.randint(1, 3)
            assign_sub = max(0, int(assign_due * sub_rate))
            on_time = max(0, assign_sub - random.randint(0, 1))
        else:  # Low risk
            att_rate = round(random.uniform(0.78, 0.98), 2)
            quiz_avg = round(random.uniform(62, 92), 2)
            sub_rate = round(random.uniform(0.75, 1.0), 2)
            logins = random.randint(10, 25)
            study_mins = random.randint(120, 360)
            eng_score = round(random.uniform(0.65, 0.95), 4)
            classes_held = random.randint(3, 5)
            classes_att = min(classes_held, max(2, int(classes_held * att_rate)))
            quizzes_avail = random.randint(1, 3)
            quizzes_att = quizzes_avail
            assign_due = random.randint(1, 3)
            assign_sub = assign_due
            on_time = max(assign_sub - random.randint(0, 1), assign_sub - 1)

        # Add slight weekly progression for improving students
        if week > 1:
            eng_score = round(min(1.0, eng_score + random.uniform(-0.02, 0.04)), 4)

        avg_session = round(study_mins / max(logins, 1), 2)

        db.add(models.EngagementMetric(
            student_id=enrollment.student_id,
            course_id=enrollment.course_id,
            session_id=session.id,
            week_number=week,
            classes_held=classes_held,
            classes_attended=classes_att,
            attendance_rate=Decimal(str(att_rate)),
            quizzes_available=quizzes_avail,
            quizzes_attempted=quizzes_att,
            quiz_attempt_rate=Decimal(str(round(quizzes_att / max(quizzes_avail, 1), 2))),
            quiz_average_score=Decimal(str(quiz_avg)),
            assignments_due=assign_due,
            assignments_submitted=assign_sub,
            on_time_submissions=on_time,
            submission_rate=Decimal(str(sub_rate)),
            login_count=logins,
            total_study_time_mins=study_mins,
            avg_session_duration_mins=Decimal(str(avg_session)),
            engagement_score=Decimal(str(eng_score)),
            computed_at=now - timedelta(weeks=4 - week),
        ))
        em_count += 1

    if em_count % 500 == 0:
        db.flush()

db.flush()
print(f"   -> Created {em_count} engagement metric records")


# ══════════════════════════════════════════════════════════════════════════════
# 3. SEED ATTENDANCE SESSIONS + RECORDS (for QR attendance pages)
# ══════════════════════════════════════════════════════════════════════════════
print("\n3. Seeding attendance sessions + records...")

# Clear existing attendance data
db.query(models.AttendanceRecord).delete()
db.query(models.AttendanceSession).delete()
db.flush()

# Build course -> enrolled students map
course_students = {}
for e in enrollments:
    course_students.setdefault(e.course_id, []).append(e.student_id)

courses_db = db.query(models.Course).filter(
    models.Course.session_id == session.id
).all()

att_sess_count = 0
att_rec_count = 0
sem_start = date(2026, 1, 13)  # matches seed_settings semester_start_date
session_code_counter = 1000

for course in courses_db:
    students_in_course = course_students.get(course.id, [])
    if not students_in_course:
        continue

    lecturer_id = course.lecturer_id
    if not lecturer_id:
        continue

    # 8 lecture sessions over 4 weeks (2 per week)
    for w in range(4):
        for d in range(2):
            lec_date = sem_start + timedelta(weeks=w, days=d * 2 + 1)
            lecture_num = w * 2 + d + 1
            session_code_counter += 1
            expires = datetime.combine(lec_date, datetime.min.time()
                .replace(hour=11)).replace(tzinfo=timezone.utc)

            att_session = models.AttendanceSession(
                course_id=course.id,
                session_code=f"S{session_code_counter:05d}",
                lecture_date=lec_date,
                lecture_number=lecture_num,
                created_by=lecturer_id,
                expires_at=expires,
            )
            db.add(att_session)
            db.flush()
            att_sess_count += 1

            # Only students who attend get a record (presence = having a record)
            for stu_id in students_in_course:
                key = (str(stu_id), course.id)
                rs = risk_map.get(key)
                if rs and rs.risk_level == "High":
                    attend_prob = 0.45
                elif rs and rs.risk_level == "Medium":
                    attend_prob = 0.72
                else:
                    attend_prob = 0.90

                if random.random() < attend_prob:
                    marked = datetime.combine(lec_date, datetime.min.time()
                        .replace(hour=9, minute=random.randint(1, 15))
                    ).replace(tzinfo=timezone.utc)
                    db.add(models.AttendanceRecord(
                        attendance_session_id=att_session.id,
                        student_id=stu_id,
                        course_id=course.id,
                        marked_at=marked,
                        scan_method=random.choice(["code", "qr"]),
                    ))
                    att_rec_count += 1

    if att_sess_count % 50 == 0:
        db.flush()

db.flush()
print(f"   -> {att_sess_count} attendance sessions, {att_rec_count} attendance records")


# ══════════════════════════════════════════════════════════════════════════════
# 4. SEED STUDENT CHECKINS (mood data for mood charts)
# ══════════════════════════════════════════════════════════════════════════════
print("\n4. Seeding student check-ins (mood data)...")

db.query(models.StudentCheckin).delete()
db.flush()

checkin_count = 0
MOODS = ["great", "good", "okay", "struggling", "overwhelmed"]
MOOD_WEIGHTS = {
    "High":   [0.02, 0.08, 0.25, 0.40, 0.25],
    "Medium": [0.10, 0.25, 0.35, 0.20, 0.10],
    "Low":    [0.30, 0.40, 0.20, 0.08, 0.02],
}

# One checkin per enrollment per week (up to 4 weeks)
for enrollment in enrollments:
    sid = str(enrollment.student_id)
    key = (sid, enrollment.course_id)
    rs = risk_map.get(key)
    risk_level = rs.risk_level if rs else "Medium"

    # 2-4 weekly checkins
    n_checkins = random.randint(2, 4)
    weeks_used = random.sample(WEEKS, min(n_checkins, len(WEEKS)))

    for week in weeks_used:
        mood = random.choices(MOODS, weights=MOOD_WEIGHTS[risk_level])[0]

        note = None
        if mood == "struggling":
            note = random.choice([
                "Finding it hard to keep up with assignments",
                "Missed some classes this week",
                "Need help understanding the material",
            ])
        elif mood == "overwhelmed":
            note = random.choice([
                "Too many deadlines at once",
                "Personal issues affecting studies",
                "Feeling lost in this course",
            ])

        db.add(models.StudentCheckin(
            student_id=enrollment.student_id,
            course_id=enrollment.course_id,
            week_number=week,
            mood=mood,
            note=note,
            created_at=datetime.combine(
                sem_start + timedelta(weeks=week - 1, days=random.randint(0, 4)),
                datetime.min.time().replace(hour=random.randint(8, 20))
            ).replace(tzinfo=timezone.utc),
        ))
        checkin_count += 1

db.flush()
print(f"   -> {checkin_count} student check-ins")


# ══════════════════════════════════════════════════════════════════════════════
# 5. SEED COURSE MATERIALS (for material access pages)
# ══════════════════════════════════════════════════════════════════════════════
print("\n5. Seeding course materials...")

db.query(models.MaterialReadingSession).delete()
db.query(models.CourseMaterial).delete()
db.flush()

MATERIAL_TYPES = ["pdf", "pptx", "mp4", "docx"]
MATERIAL_TITLES = [
    "Week {} Lecture Notes", "Chapter {} Summary", "Tutorial {} Worksheet",
    "Lab {} Manual", "Practice Problems Set {}",
]

mat_count = 0
mat_read_count = 0

for course in courses_db:
    if not course.lecturer_id:
        continue
    # 3-5 materials per course
    n_mats = random.randint(3, 5)
    for mi in range(n_mats):
        title = random.choice(MATERIAL_TITLES).format(mi + 1)
        ftype = random.choice(MATERIAL_TYPES)
        fname = f"{course.course_code.lower()}_w{mi+1}.{ftype}"
        mat = models.CourseMaterial(
            course_id=course.id,
            filename=f"{course.course_code} - {title}.{ftype}",
            file_path=f"/uploads/materials/{fname}",
            file_type=ftype,
            week_number=mi + 1,
            topic_tag=title.split(" ")[0],
            uploaded_by=course.lecturer_id,
            uploaded_at=datetime.combine(
                sem_start + timedelta(days=mi * 5),
                datetime.min.time().replace(hour=10)
            ).replace(tzinfo=timezone.utc),
        )
        db.add(mat)
        db.flush()
        mat_count += 1

        # Some students read the material
        students_in_course = course_students.get(course.id, [])
        for stu_id in students_in_course:
            key = (str(stu_id), course.id)
            rs = risk_map.get(key)
            if rs and rs.risk_level == "High":
                read_prob = 0.25
            elif rs and rs.risk_level == "Medium":
                read_prob = 0.55
            else:
                read_prob = 0.85

            if random.random() < read_prob:
                total_pages = random.randint(10, 50)
                last_page = random.randint(3, total_pages)
                progress = round(last_page / total_pages * 100, 1)
                db.add(models.MaterialReadingSession(
                    student_id=stu_id,
                    material_id=mat.id,
                    last_page=last_page,
                    total_pages=total_pages,
                    progress_pct=progress,
                    time_spent_secs=random.randint(120, 1800),
                    scroll_depth_pct=round(random.uniform(30, 100), 1),
                    revisit_count=random.randint(1, 4),
                    last_read_at=datetime.combine(
                        sem_start + timedelta(days=mi * 5 + random.randint(0, 3)),
                        datetime.min.time().replace(hour=random.randint(8, 22))
                    ).replace(tzinfo=timezone.utc),
                ))
                mat_read_count += 1

db.flush()
print(f"   -> {mat_count} materials, {mat_read_count} reading sessions")


# ══════════════════════════════════════════════════════════════════════════════
# 6. SEED NOTIFICATIONS (so notification pages aren't empty)
# ══════════════════════════════════════════════════════════════════════════════
print("\n6. Seeding notifications...")

db.query(models.Notification).delete()
db.flush()

NOTIF_TYPES = [
    ("risk_alert", "Your risk level has changed", "Your risk level in {course} is now {level}. Check your dashboard for details."),
    ("attendance_warning", "Attendance Alert", "Your attendance in {course} has dropped below 70%. Please attend upcoming classes."),
    ("quiz_reminder", "Quiz Available", "A new quiz is available for {course}. Complete it before the deadline."),
    ("positive_nudge", "Great Progress!", "You're making great progress in {course}! Keep it up."),
    ("checkin_reminder", "Weekly Check-In", "How are you feeling this week? Your weekly check-in is waiting."),
]

notif_count = 0
for student in students:
    # 2-5 notifications per student
    n_notifs = random.randint(2, 5)
    student_enrollments = [e for e in enrollments if str(e.student_id) == str(student.id)]
    if not student_enrollments:
        continue

    for _ in range(n_notifs):
        ntype, title, template = random.choice(NOTIF_TYPES)
        enr = random.choice(student_enrollments)
        course = db.query(models.Course).filter(models.Course.id == enr.course_id).first()
        course_code = course.course_code if course else "CSC301"

        rs = risk_map.get((str(student.id), enr.course_id))
        level = rs.risk_level if rs else "Medium"

        message = template.format(course=course_code, level=level)
        days_ago = random.randint(0, 21)

        db.add(models.Notification(
            user_id=student.id,
            notification_type=ntype,
            title=title,
            message=message,
            is_read=random.random() < 0.4,
            priority=random.choice([3, 5, 8]),
            created_at=now - timedelta(days=days_ago, hours=random.randint(0, 12)),
        ))
        notif_count += 1

db.flush()
print(f"   -> {notif_count} notifications")


# ══════════════════════════════════════════════════════════════════════════════
# 7. SEED INTERVENTIONS (so intervention pages have data)
# ══════════════════════════════════════════════════════════════════════════════
print("\n7. Seeding interventions...")

db.query(models.Intervention).delete()
db.flush()

intervention_types = db.query(models.InterventionType).all()
itype_map = {it.code: it for it in intervention_types}

int_count = 0
# High risk students get interventions
for rs in risk_scores:
    if rs.risk_level != "High":
        continue
    if random.random() > 0.7:  # 70% of high-risk get interventions
        continue

    itype_code = random.choice(["academic_ref", "attend_alert", "mood_support", "quiz_coaching"])
    itype = itype_map.get(itype_code)
    if not itype:
        continue

    status = random.choice(["pending", "in_progress", "completed"])
    completed_at = (now - timedelta(days=random.randint(0, 5))) if status == "completed" else None

    db.add(models.Intervention(
        student_id=rs.student_id,
        course_id=rs.course_id,
        risk_score_id=rs.id,
        intervention_type_id=itype.id,
        status=status,
        completed_at=completed_at,
        ai_content=f"Based on your {rs.risk_level.lower()} risk level, we recommend reviewing course materials and attending office hours.",
        recommended_at=now - timedelta(days=random.randint(1, 14)),
    ))
    int_count += 1

# Medium risk students get lighter interventions
for rs in risk_scores:
    if rs.risk_level != "Medium":
        continue
    if random.random() > 0.3:  # 30% of medium-risk
        continue

    itype_code = random.choice(["peer_study_prompt", "self_study_boost", "positive_nudge"])
    itype = itype_map.get(itype_code)
    if not itype:
        continue

    db.add(models.Intervention(
        student_id=rs.student_id,
        course_id=rs.course_id,
        risk_score_id=rs.id,
        intervention_type_id=itype.id,
        status=random.choice(["pending", "completed"]),
        ai_content="Keep up the good work! Consider joining a study group for additional support.",
        recommended_at=now - timedelta(days=random.randint(1, 10)),
    ))
    int_count += 1

db.flush()
print(f"   -> {int_count} interventions")


# ══════════════════════════════════════════════════════════════════════════════
# 8. SEED LOGIN SESSIONS (for study time / login frequency tracking)
# ══════════════════════════════════════════════════════════════════════════════
print("\n8. Seeding login sessions...")

db.query(models.LoginSession).delete()
db.flush()

login_count = 0
for student in students:
    sid = str(student.id)
    # Determine login frequency from risk level
    any_rs = next((r for r in risk_scores if str(r.student_id) == sid), None)
    if any_rs and any_rs.risk_level == "High":
        n_logins = random.randint(4, 12)
    elif any_rs and any_rs.risk_level == "Medium":
        n_logins = random.randint(10, 25)
    else:
        n_logins = random.randint(18, 40)

    for li in range(n_logins):
        login_day = sem_start + timedelta(days=random.randint(0, 27))
        login_hour = random.randint(7, 22)
        logged_in = datetime.combine(login_day, datetime.min.time()
            .replace(hour=login_hour, minute=random.randint(0, 59))
        ).replace(tzinfo=timezone.utc)
        duration = random.randint(300, 7200)  # 5 min to 2 hours
        logged_out = logged_in + timedelta(seconds=duration)

        db.add(models.LoginSession(
            user_id=student.id,
            logged_in_at=logged_in,
            logged_out_at=logged_out,
            session_duration_secs=duration,
        ))
        login_count += 1

db.flush()
print(f"   -> {login_count} login sessions")


# ══════════════════════════════════════════════════════════════════════════════
# COMMIT
# ══════════════════════════════════════════════════════════════════════════════
print("\nCommitting all changes...")
db.commit()
db.close()

print("\n" + "=" * 60)
print("  ENGAGEMENT SEED COMPLETE")
print(f"  - {updated_rs} risk scores updated (feature_snapshot + student_state)")
print(f"  - {em_count} engagement metrics")
print(f"  - {att_sess_count} attendance sessions, {att_rec_count} records")
print(f"  - {checkin_count} student check-ins")
print(f"  - {mat_count} course materials, {mat_read_count} reading sessions")
print(f"  - {notif_count} notifications")
print(f"  - {int_count} interventions")
print(f"  - {login_count} login sessions")
print("=" * 60)
