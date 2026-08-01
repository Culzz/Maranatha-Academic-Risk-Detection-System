"""
Seed Wave 4 data — fake class timetable, exam timetable, calendar events, and student results.
All data matches the seeded users, courses, and sessions from seed_data.py.

Run:  python seed_wave4.py   (from the backend/ directory)
"""

import random
import sys
import os
from datetime import datetime, timezone, date, timedelta
from decimal import Decimal

# Ensure backend is importable
sys.path.insert(0, os.path.dirname(__file__))

from database import SessionLocal, engine, Base
import app_models as models

# Create tables if they don't exist
Base.metadata.create_all(bind=engine)

db = SessionLocal()

print("=" * 60)
print("  WAVE 4 SEED — Timetable, Exam, Calendar & Results")
print("=" * 60)

# ── Helpers ──────────────────────────────────────────────────────────────────

def get_active_session():
    s = db.query(models.AcademicSession).filter(models.AcademicSession.is_active == True).first()
    if not s:
        print("ERROR: No active academic session found! Run seed_data.py first.")
        sys.exit(1)
    return s

def get_all_courses(session_id):
    return db.query(models.Course).filter(models.Course.session_id == session_id).all()

def get_students():
    return db.query(models.User).filter(models.User.role == "student").all()

def get_lecturers():
    return db.query(models.User).filter(models.User.role == "lecturer").all()

def get_admin():
    return db.query(models.User).filter(models.User.role == "admin").first()


session = get_active_session()
courses = get_all_courses(session.id)
students = get_students()
lecturers = get_lecturers()
admin = get_admin()

print(f"  Session:    {session.session_label} (id={session.id})")
print(f"  Courses:    {len(courses)}")
print(f"  Students:   {len(students)}")
print(f"  Lecturers:  {len(lecturers)}")
print(f"  Admin:      {admin.full_name if admin else 'NOT FOUND'}")
print()

# Build lookup maps
course_map = {c.course_code: c for c in courses}
lecturer_map = {}
for c in courses:
    if c.lecturer_id:
        lec = db.query(models.User).filter(models.User.id == c.lecturer_id).first()
        if lec:
            lecturer_map[c.course_code] = lec

# Department grouping
dept_courses = {}
for c in courses:
    dept = c.department.name if c.department else "Unknown"
    dept_courses.setdefault(dept, []).append(c)

# ══════════════════════════════════════════════════════════════════════════════
# 1. CLASS TIMETABLE
# ══════════════════════════════════════════════════════════════════════════════
print("1. Seeding CLASS TIMETABLE...")

# Clear old data
db.query(models.ClassTimetable).filter(models.ClassTimetable.session_id == session.id).delete()
db.flush()

DAYS = ["MON", "TUE", "WED", "THURS", "FRI"]
TIME_SLOTS = ["8am-10am", "10am-12pm", "1pm-3pm", "3pm-5pm"]
VENUES = ["Lect H 1", "Lect H 2", "Lect H 3", "Lect H 4", "Lect H 5",
          "Lect H 6", "Lect H 7", "Lect H 8", "Lect H 9", "Lect H 10",
          "Auditorium", "Physics Lab", "Chemistry Lab", "Science Block"]

class_count = 0
venue_idx = 0

for dept_name, dept_course_list in dept_courses.items():
    # Get faculty name
    faculty = None
    if dept_course_list:
        dept_obj = dept_course_list[0].department
        if dept_obj and dept_obj.faculty:
            faculty = dept_obj.faculty.name

    # Assign each course a day+slot
    slot_idx = 0
    for course in dept_course_list:
        day = DAYS[slot_idx % len(DAYS)]
        time_slot = TIME_SLOTS[slot_idx // len(DAYS) % len(TIME_SLOTS)]
        venue = VENUES[venue_idx % len(VENUES)]
        venue_idx += 1

        lec = lecturer_map.get(course.course_code)
        lec_name = lec.full_name.split()[-1] if lec else None

        db.add(models.ClassTimetable(
            session_id=session.id,
            department=dept_name,
            faculty=faculty,
            day_of_week=day,
            time_slot=time_slot,
            course_id=course.id,
            course_code=course.course_code,
            lecturer_id=lec.id if lec else None,
            lecturer_name_raw=lec_name,
            venue=venue,
            is_break=False,
            uploaded_by=admin.id if admin else None,
        ))
        class_count += 1
        slot_idx += 1

    # Add BREAK entries for each day
    for day in DAYS:
        db.add(models.ClassTimetable(
            session_id=session.id,
            department=dept_name,
            faculty=faculty,
            day_of_week=day,
            time_slot="12pm-1pm",
            course_code="BREAK",
            is_break=True,
            uploaded_by=admin.id if admin else None,
        ))
        class_count += 1

db.flush()
print(f"   -> {class_count} class timetable entries created")


# ══════════════════════════════════════════════════════════════════════════════
# 2. EXAM TIMETABLE
# ══════════════════════════════════════════════════════════════════════════════
print("2. Seeding EXAM TIMETABLE...")

db.query(models.ExamTimetableInvigilator).delete()
db.query(models.ExamTimetable).filter(models.ExamTimetable.session_id == session.id).delete()
db.flush()

EXAM_TIME_SLOTS = ["9:00-11:00", "11:00-1:00", "2:00-4:00"]
EXAM_HALLS = ["Lect H 7", "Lect H 8", "Lect H 9", "Lect H 10", "Auditorium"]

# Exams start Feb 17, 2026 (matching the brief)
exam_start = date(2026, 2, 17)
exam_count = 0

# Spread courses across exam days (3 slots per day, skip weekends)
all_courses_sorted = sorted(courses, key=lambda c: (c.department_id, c.level, c.course_code))
day_offset = 0
slot_idx = 0

for i, course in enumerate(all_courses_sorted):
    exam_date = exam_start + timedelta(days=day_offset)
    # Skip weekends
    while exam_date.weekday() >= 5:
        day_offset += 1
        exam_date = exam_start + timedelta(days=day_offset)

    time_slot = EXAM_TIME_SLOTS[slot_idx % len(EXAM_TIME_SLOTS)]
    hall = EXAM_HALLS[i % len(EXAM_HALLS)]

    # Assign invigilator (the course lecturer or a random one)
    lec = lecturer_map.get(course.course_code)
    invig_name = lec.full_name if lec else None

    entry = models.ExamTimetable(
        session_id=session.id,
        exam_date=exam_date,
        time_slot=time_slot,
        course_id=course.id,
        course_code=course.course_code,
        exam_hall=hall,
        invigilator_names_raw=invig_name,
        is_break=False,
        is_community_service=False,
        uploaded_by=admin.id if admin else None,
    )
    db.add(entry)
    db.flush()

    # Add invigilator link
    if lec:
        db.add(models.ExamTimetableInvigilator(
            exam_timetable_id=entry.id,
            user_id=lec.id,
        ))

    exam_count += 1
    slot_idx += 1
    if slot_idx % len(EXAM_TIME_SLOTS) == 0:
        day_offset += 1

    # Add BREAK after slot 2 on each day (1:00-2:00)
    if slot_idx % len(EXAM_TIME_SLOTS) == 2:
        break_date = exam_start + timedelta(days=day_offset - 1)
        while break_date.weekday() >= 5:
            break_date += timedelta(days=1)
        # Wednesday community service
        is_wed = break_date.weekday() == 2
        db.add(models.ExamTimetable(
            session_id=session.id,
            exam_date=break_date,
            time_slot="1:00-2:00",
            course_code="COMMUNITY SERVICE/FELLOWSHIP" if is_wed else "BREAK",
            is_break=not is_wed,
            is_community_service=is_wed,
            uploaded_by=admin.id if admin else None,
        ))
        exam_count += 1

db.flush()
print(f"   -> {exam_count} exam timetable entries created")


# ══════════════════════════════════════════════════════════════════════════════
# 3. ACADEMIC CALENDAR
# ══════════════════════════════════════════════════════════════════════════════
print("3. Seeding ACADEMIC CALENDAR...")

db.query(models.AcademicCalendarEvent).filter(
    models.AcademicCalendarEvent.session_id == session.id
).delete()
db.flush()

CALENDAR_EVENTS = [
    # First Semester
    ("FIRST", date(2025, 9, 5), None, "Resumption of fresh students", "resumption"),
    ("FIRST", date(2025, 10, 5), None, "Returning of old students", "resumption"),
    ("FIRST", date(2025, 10, 7), None, "Commencement of lectures and registrations", "lectures"),
    ("FIRST", date(2025, 10, 21), None, "Commencement of late registration with penalty", "lectures"),
    ("FIRST", date(2025, 10, 27), None, "University First Semester Thanksgiving service", "service"),
    ("FIRST", date(2025, 12, 18), None, "Christmas carols and hymns", "service"),
    ("FIRST", date(2025, 12, 20), None, "Commencement of Christmas Break", "break"),
    ("FIRST", date(2026, 1, 5), date(2026, 1, 7), "Return of students from Christmas break", "resumption"),
    ("FIRST", date(2026, 1, 8), None, "Resumption of lectures", "lectures"),
    ("FIRST", date(2026, 1, 26), date(2026, 1, 31), "Students week", "other"),
    ("FIRST", date(2026, 2, 17), None, "Commencement of First Semester examinations", "exam"),
    ("FIRST", date(2026, 2, 28), None, "End of First semester", "exam"),
    # Second Semester
    ("SECOND", date(2026, 3, 14), date(2026, 3, 16), "Returning of all students", "resumption"),
    ("SECOND", date(2026, 3, 17), None, "Commencement of lectures and registrations", "lectures"),
    ("SECOND", date(2026, 3, 23), None, "University second Thanksgiving service", "service"),
    ("SECOND", date(2026, 3, 24), date(2026, 3, 27), "Matriculation of new students and other activities", "other"),
    ("SECOND", date(2026, 3, 31), None, "Commencement of late registration with penalty", "lectures"),
    ("SECOND", date(2026, 6, 22), date(2026, 6, 28), "Week of spiritual emphasis", "service"),
    ("SECOND", date(2026, 7, 14), None, "Commencement of second semester examination", "exam"),
    ("SECOND", date(2026, 7, 28), None, "End of second semester examination", "exam"),
    ("SECOND", date(2026, 7, 29), date(2026, 7, 30), "End of academic session", "other"),
]

cal_count = 0
for sem, ev_date, ev_end, label, ev_type in CALENDAR_EVENTS:
    db.add(models.AcademicCalendarEvent(
        session_id=session.id,
        semester=sem,
        event_date=ev_date,
        event_date_end=ev_end,
        event_label=label,
        event_type=ev_type,
        uploaded_by=admin.id if admin else None,
    ))
    cal_count += 1

db.flush()
print(f"   -> {cal_count} calendar events created")


# ══════════════════════════════════════════════════════════════════════════════
# 4. STUDENT RESULTS
# ══════════════════════════════════════════════════════════════════════════════
print("4. Seeding STUDENT RESULTS...")

db.query(models.StudentResultCourse).delete()
db.query(models.StudentResult).delete()
db.flush()

random.seed(42)  # Reproducible results

def compute_grade(score, credit_units):
    if score is None or score < 40:
        return "F", 0.0
    elif score < 45:
        return "E", 1.0 * credit_units
    elif score < 50:
        return "D", 2.0 * credit_units
    elif score < 60:
        return "C", 3.0 * credit_units
    elif score < 70:
        return "B", 4.0 * credit_units
    else:
        return "A", 5.0 * credit_units


result_count = 0
course_result_count = 0

# Get enrollments grouped by student
enrollments = db.query(models.Enrollment).filter(
    models.Enrollment.session_id == session.id
).all()

student_courses = {}
for e in enrollments:
    student_courses.setdefault(str(e.student_id), []).append(e.course_id)

for student in students:
    sid = str(student.id)
    enrolled_course_ids = student_courses.get(sid, [])
    if not enrolled_course_ids:
        continue

    enrolled_courses = [c for c in courses if c.id in enrolled_course_ids]
    if not enrolled_courses:
        continue

    # Get department info
    dept_name = student.department.name if student.department else "Unknown"
    faculty_name = None
    if student.department and student.department.faculty:
        faculty_name = student.department.faculty.name

    # Generate realistic scores
    # 60% of students are strong (55-95), 25% are average (40-70), 15% are weak (20-55)
    r = random.random()
    if r < 0.15:
        score_range = (20, 55)  # Weak
    elif r < 0.40:
        score_range = (40, 70)  # Average
    else:
        score_range = (55, 95)  # Strong

    course_results = []
    tul = 0
    tup = 0
    tuf = 0
    gp = 0.0
    outstanding = []

    for course in enrolled_courses:
        # Add some variance per course
        base_score = random.randint(score_range[0], score_range[1])
        # Clamp to 0-100
        score = max(0, min(100, base_score + random.randint(-5, 5)))

        grade, gp_contribution = compute_grade(score, course.credit_units)
        passed = grade != "F"
        gp += gp_contribution
        tul += course.credit_units

        if passed:
            tup += course.credit_units
        else:
            tuf += course.credit_units
            outstanding.append(course.course_code)

        course_results.append({
            "course_code": course.course_code,
            "course_title": course.course_title,
            "credit_units": course.credit_units,
            "score": score,
            "grade": grade,
            "grade_points": gp_contribution,
            "passed": passed,
        })

    sgpa = round(gp / tul, 2) if tul > 0 else 0.0
    cgpa = sgpa  # First semester, no prior data
    status = "GS" if sgpa > 2.0 else "NGS"
    remark = "Good Standing" if status == "GS" else "Not in Good Standing"

    result_record = models.StudentResult(
        student_id=student.id,
        session_id=session.id,
        semester="1ST",
        faculty=faculty_name,
        department=dept_name,
        level=student.level,
        tul=tul,
        tup=tup,
        tuf=tuf,
        gp=Decimal(str(round(gp, 2))),
        sgpa=Decimal(str(sgpa)),
        ctul=0,
        pgpa=Decimal("0"),
        cgpa=Decimal(str(cgpa)),
        status=status,
        courses_outstanding=", ".join(outstanding) if outstanding else None,
        remark=remark,
        result_released_at=datetime.now(timezone.utc),
        uploaded_by=admin.id if admin else None,
    )
    db.add(result_record)
    db.flush()
    result_count += 1

    for cr in course_results:
        db.add(models.StudentResultCourse(
            result_id=result_record.id,
            course_code=cr["course_code"],
            course_title=cr["course_title"],
            credit_units=cr["credit_units"],
            score=cr["score"],
            grade=cr["grade"],
            grade_points=Decimal(str(cr["grade_points"])),
            passed=cr["passed"],
        ))
        course_result_count += 1

db.flush()
print(f"   -> {result_count} student result records created")
print(f"   -> {course_result_count} course result entries created")

# ══════════════════════════════════════════════════════════════════════════════
# 5. ACTIVITY DATA (Attendance Sessions + Records + Login Sessions)
# ══════════════════════════════════════════════════════════════════════════════
print("5. Seeding ACTIVITY DATA (attendance & logins)...")

# Clear old data
db.query(models.AttendanceRecord).delete()
db.query(models.AttendanceSession).delete()
db.query(models.LoginSession).delete()
db.flush()

import string

random.seed(99)  # Reproducible

att_session_count = 0
att_record_count = 0
login_count_seed = 0

# Create 1 attendance session per course with ~75% student attendance
for course in courses:
    lec = lecturer_map.get(course.course_code)
    if not lec:
        continue

    # Generate a unique 6-char alphanumeric code
    code = ''.join(random.choices(string.ascii_uppercase + string.digits, k=6))
    # Ensure uniqueness (prefix with course id)
    code = f"{course.id:03d}{code[:4]}"[:10]

    att_sess = models.AttendanceSession(
        course_id=course.id,
        session_code=code,
        lecture_date=date(2026, 1, 15),
        lecture_number=1,
        created_by=lec.id,
        expires_at=datetime(2026, 1, 15, 10, 0, 0),
    )
    db.add(att_sess)
    db.flush()
    att_session_count += 1

    # Get enrolled students for this course
    enrolled_student_ids = [
        e.student_id for e in enrollments
        if e.course_id == course.id
    ]

    # 75% attendance rate
    attending = random.sample(
        enrolled_student_ids,
        k=max(1, int(len(enrolled_student_ids) * 0.75))
    ) if enrolled_student_ids else []

    for stu_id in attending:
        db.add(models.AttendanceRecord(
            attendance_session_id=att_sess.id,
            student_id=stu_id,
            course_id=course.id,
            marked_at=datetime(2026, 1, 15, 8, random.randint(5, 50), 0),
        ))
        att_record_count += 1

db.flush()

# Create 1 login session per student
for student in students:
    db.add(models.LoginSession(
        user_id=student.id,
        logged_in_at=datetime(2026, 1, 14, random.randint(7, 20), random.randint(0, 59), 0),
        logged_out_at=datetime(2026, 1, 14, random.randint(21, 23), random.randint(0, 59), 0),
        session_duration_secs=random.randint(1800, 14400),
    ))
    login_count_seed += 1

db.flush()
print(f"   -> {att_session_count} attendance sessions created")
print(f"   -> {att_record_count} attendance records created")
print(f"   -> {login_count_seed} login sessions created")


# ── Commit everything ────────────────────────────────────────────────────────
db.commit()
db.close()

print()
print("=" * 60)
print("  WAVE 4 SEED COMPLETE!")
print(f"  Class timetable:   {class_count} entries")
print(f"  Exam timetable:    {exam_count} entries")
print(f"  Calendar events:   {cal_count} events")
print(f"  Results:           {result_count} students, {course_result_count} course grades")
print(f"  Attendance:        {att_session_count} sessions, {att_record_count} records")
print(f"  Login sessions:    {login_count_seed} entries")
print("=" * 60)
