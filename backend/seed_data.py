"""
seed_data.py — Populate the database with test data for development.

Run from the backend/ directory:
    python seed_data.py

Creates:
  - 4 Faculties, 22 Departments
  - 1 Academic Session (2025/2026 First Semester, active)
  - 220 Students (10 per department, levels 200/300/400)
  - 110 Lecturers (5 per department)
  - Courses (8 each for CSC/SEN/CYB/CPE, 4 each for the other 18 departments)
  - Enrollments (students → courses at their level)
  - Whitelist entries
  - Output: seed_credentials.txt, seed_students.csv, seed_lecturers.csv

Safe to re-run — checks for existing records before inserting.
"""
import sys
import os
import csv
import uuid
import random
from datetime import date, datetime, timezone, timedelta

sys.path.insert(0, os.path.dirname(__file__))

# Suppress SQLAlchemy SQL logging during seeding (must be set BEFORE import)
import logging
logging.getLogger("sqlalchemy.engine").setLevel(logging.WARNING)
logging.getLogger("sqlalchemy.engine.Engine").setLevel(logging.WARNING)

# Override echo setting so create_all doesn't flood the console
os.environ["DATABASE_ECHO"] = "0"

from database import SessionLocal, engine, Base

# Force-disable echo on the engine
engine.echo = False

import app_models as models
import bcrypt as _bcrypt

# ---------------------------------------------------------------------------
# Config
# ---------------------------------------------------------------------------
STUDENT_PASSWORD = "Student@123"
LECTURER_PASSWORD = "Lecturer@123"

FACULTIES = [
    {"name": "Faculty of Natural and Applied Sciences", "code": "FNAS"},
    {"name": "Faculty of Arts, Management and Social Sciences", "code": "FAMSS"},
    {"name": "Faculty of Basic Medical Sciences", "code": "FBMS"},
    {"name": "Faculty of Environmental Sciences", "code": "FES"},
]

# faculty_code maps dept → faculty (22 departments across 4 faculties)
DEPARTMENTS = [
    # FNAS — 9 departments
    {"name": "Computer Science",         "code": "CSC", "faculty": "FNAS"},
    {"name": "Cybersecurity",            "code": "CYB", "faculty": "FNAS"},
    {"name": "Software Engineering",     "code": "SEN", "faculty": "FNAS"},
    {"name": "Computer Engineering",     "code": "CPE", "faculty": "FNAS"},
    {"name": "Mathematics",              "code": "MTH", "faculty": "FNAS"},
    {"name": "Biochemistry",             "code": "BCH", "faculty": "FNAS"},
    {"name": "Information Technology",   "code": "INF", "faculty": "FNAS"},
    {"name": "Industrial Chemistry",     "code": "ICH", "faculty": "FNAS"},
    {"name": "Physics and Electronics",  "code": "PHY", "faculty": "FNAS"},
    # FAMSS — 6 departments
    {"name": "Economics",                            "code": "ECO", "faculty": "FAMSS"},
    {"name": "Accounting",                           "code": "ACC", "faculty": "FAMSS"},
    {"name": "Business Administration",              "code": "BUS", "faculty": "FAMSS"},
    {"name": "Criminology and Security Studies",     "code": "CSS", "faculty": "FAMSS"},
    {"name": "English and Communication",            "code": "ENG", "faculty": "FAMSS"},
    {"name": "History and International Relations",  "code": "HIS", "faculty": "FAMSS"},
    # FBMS — 4 departments
    {"name": "Nursing",                        "code": "NRS", "faculty": "FBMS"},
    {"name": "Doctor of Physiotherapy",        "code": "PHT", "faculty": "FBMS"},
    {"name": "Public Health",                  "code": "PBH", "faculty": "FBMS"},
    {"name": "Health Information Management",  "code": "HIM", "faculty": "FBMS"},
    # FES — 3 departments
    {"name": "Architecture",        "code": "ARC", "faculty": "FES"},
    {"name": "Quantity Surveying",  "code": "QUS", "faculty": "FES"},
    {"name": "Estate Management",   "code": "EST", "faculty": "FES"},
]

COURSES = {
    "CSC": [
        ("CSC201", "Introduction to Programming",       200, 3),
        ("CSC202", "Discrete Mathematics",               200, 3),
        ("CSC301", "Data Structures and Algorithms",     300, 3),
        ("CSC302", "Computer Networks",                  300, 3),
        ("CSC303", "Operating Systems",                  300, 3),
        ("CSC304", "Database Management Systems",        300, 3),
        ("CSC401", "Artificial Intelligence",            400, 3),
        ("CSC402", "Compiler Construction",              400, 3),
    ],
    "SEN": [
        ("SEN201", "Fundamentals of Software Engineering", 200, 3),
        ("SEN202", "Object-Oriented Programming",          200, 3),
        ("SEN301", "Software Design Patterns",             300, 3),
        ("SEN302", "Agile Software Development",           300, 2),
        ("SEN303", "Software Requirements Engineering",    300, 3),
        ("SEN304", "Human-Computer Interaction",           300, 2),
        ("SEN401", "Software Project Management",          400, 3),
        ("SEN402", "Software Testing and Quality Assurance", 400, 3),
    ],
    "CYB": [
        ("CYB201", "Introduction to Cybersecurity",           200, 3),
        ("CYB202", "Computer Forensics Fundamentals",         200, 3),
        ("CYB301", "Network Security",                        300, 3),
        ("CYB302", "Cryptography and Information Security",   300, 3),
        ("CYB303", "Malware Analysis and Reverse Engineering", 300, 3),
        ("CYB304", "Security Operations and Incident Response", 300, 2),
        ("CYB401", "Ethical Hacking and Penetration Testing", 400, 3),
        ("CYB402", "Digital Forensics",                       400, 3),
    ],
    "CPE": [
        ("CPE201", "Circuit Theory and Electronics",  200, 3),
        ("CPE202", "Digital Logic Design",            200, 3),
        ("CPE301", "Microprocessor Systems",          300, 3),
        ("CPE302", "Embedded Systems Design",         300, 3),
        ("CPE303", "Signals and Systems",             300, 3),
        ("CPE304", "Control Systems Engineering",     300, 2),
        ("CPE401", "VLSI Design and Fabrication",     400, 3),
        ("CPE402", "Computer Architecture",           400, 3),
    ],
    # 18 departments — 4 courses each (2 × L200, 1 × L300, 1 × L400)
    "MTH": [
        ("MTH201", "Linear Algebra",                   200, 3),
        ("MTH202", "Calculus and Analytical Geometry",  200, 3),
        ("MTH301", "Real Analysis",                    300, 3),
        ("MTH401", "Abstract Algebra",                 400, 3),
    ],
    "BCH": [
        ("BCH201", "General Biochemistry",             200, 3),
        ("BCH202", "Biochemical Techniques",           200, 3),
        ("BCH301", "Enzymology and Metabolism",        300, 3),
        ("BCH401", "Molecular Biology",                400, 3),
    ],
    "INF": [
        ("INF201", "Information Systems",              200, 3),
        ("INF202", "Web Technologies",                 200, 3),
        ("INF301", "IT Project Management",            300, 3),
        ("INF401", "Enterprise Systems",               400, 3),
    ],
    "ICH": [
        ("ICH201", "Organic Chemistry",                200, 3),
        ("ICH202", "Analytical Chemistry",             200, 3),
        ("ICH301", "Industrial Process Chemistry",     300, 3),
        ("ICH401", "Polymer Chemistry",                400, 3),
    ],
    "PHY": [
        ("PHY201", "Classical Mechanics",              200, 3),
        ("PHY202", "Thermal Physics",                  200, 3),
        ("PHY301", "Electronics and Instrumentation",  300, 3),
        ("PHY401", "Quantum Mechanics",                400, 3),
    ],
    "ECO": [
        ("ECO201", "Microeconomics",                   200, 3),
        ("ECO202", "Macroeconomics",                   200, 3),
        ("ECO301", "Development Economics",            300, 3),
        ("ECO401", "Econometrics",                     400, 3),
    ],
    "ACC": [
        ("ACC201", "Financial Accounting",             200, 3),
        ("ACC202", "Cost Accounting",                  200, 3),
        ("ACC301", "Management Accounting",            300, 3),
        ("ACC401", "Auditing and Assurance",           400, 3),
    ],
    "BUS": [
        ("BUS201", "Principles of Management",         200, 3),
        ("BUS202", "Business Communication",           200, 3),
        ("BUS301", "Business Policy and Strategy",     300, 3),
        ("BUS401", "Strategic Management",             400, 3),
    ],
    "CSS": [
        ("CSS201", "Introduction to Criminology",      200, 3),
        ("CSS202", "Criminal Law",                     200, 3),
        ("CSS301", "Penology and Corrections",         300, 3),
        ("CSS401", "Security Management",              400, 3),
    ],
    "ENG": [
        ("ENG201", "Introduction to Linguistics",      200, 3),
        ("ENG202", "English Composition",              200, 3),
        ("ENG301", "Media and Communication Studies",  300, 3),
        ("ENG401", "Sociolinguistics",                 400, 3),
    ],
    "HIS": [
        ("HIS201", "African History to 1800",          200, 3),
        ("HIS202", "Nigerian History",                 200, 3),
        ("HIS301", "International Relations Theory",   300, 3),
        ("HIS401", "Diplomatic History",               400, 3),
    ],
    "NRS": [
        ("NRS201", "Anatomy and Physiology",           200, 3),
        ("NRS202", "Fundamentals of Nursing",          200, 3),
        ("NRS301", "Medical-Surgical Nursing",         300, 3),
        ("NRS401", "Community Health Nursing",         400, 3),
    ],
    "PHT": [
        ("PHT201", "Human Anatomy for Physiotherapy",  200, 3),
        ("PHT202", "Kinesiology",                      200, 3),
        ("PHT301", "Musculoskeletal Physiotherapy",    300, 3),
        ("PHT401", "Neurological Physiotherapy",       400, 3),
    ],
    "PBH": [
        ("PBH201", "Introduction to Public Health",    200, 3),
        ("PBH202", "Environmental Health",             200, 3),
        ("PBH301", "Epidemiology",                     300, 3),
        ("PBH401", "Health Policy and Planning",       400, 3),
    ],
    "HIM": [
        ("HIM201", "Health Records Management",        200, 3),
        ("HIM202", "Medical Terminology",              200, 3),
        ("HIM301", "Health Informatics",               300, 3),
        ("HIM401", "Health Data Analytics",            400, 3),
    ],
    "ARC": [
        ("ARC201", "Architectural Design Studio I",    200, 3),
        ("ARC202", "History of Architecture",          200, 3),
        ("ARC301", "Building Construction Technology", 300, 3),
        ("ARC401", "Urban Design and Planning",        400, 3),
    ],
    "QUS": [
        ("QUS201", "Quantity Surveying Methods",       200, 3),
        ("QUS202", "Building Materials and Technology", 200, 3),
        ("QUS301", "Construction Economics",           300, 3),
        ("QUS401", "Project Cost Management",          400, 3),
    ],
    "EST": [
        ("EST201", "Land Law and Administration",      200, 3),
        ("EST202", "Principles of Estate Management",  200, 3),
        ("EST301", "Property Valuation",               300, 3),
        ("EST401", "Real Estate Investment Analysis",  400, 3),
    ],
}

# ---------------------------------------------------------------------------
# Nigerian name pools
# ---------------------------------------------------------------------------
MALE_FIRST = [
    "Chukwuemeka", "Ibrahim", "Tunde", "Emeka", "Babatunde", "Uche",
    "Obinna", "Adewale", "Femi", "Chijioke", "Damilola", "Kelechi",
    "Olumide", "Nnamdi", "Segun", "Abiodun", "Chinedu", "Tochukwu",
    "Adekunle", "Olusegun", "Yusuf", "Ikenna", "Olamide", "Obi",
    "Ebuka",
]

FEMALE_FIRST = [
    "Fatima", "Ngozi", "Amaka", "Halima", "Aisha", "Zainab",
    "Yetunde", "Folake", "Precious", "Maryam", "Chidinma", "Adaeze",
    "Oluwabunmi", "Funmilayo", "Nkechi", "Ifeoma", "Temitope",
    "Blessing", "Chiamaka", "Eniola", "Khadija", "Grace", "Ifunanya",
    "Omolara", "Nneoma",
]

SURNAMES = [
    "Okafor", "Abubakar", "Adeyemi", "Nwosu", "Musa", "Eze",
    "Adebayo", "Bello", "Nnaji", "Suleiman", "Obiora", "Fasanya",
    "Ogunwale", "Usman", "Adeleke", "Nwofor", "Aliyu", "Olatunji",
    "Onyekachi", "Okonkwo", "Nwachukwu", "Obi", "Ogundipe",
    "Bamidele", "Onuoha", "Adeyinka", "Chukwuma", "Lawal", "Adeoti",
    "Mohammed", "Okoro", "Babangida", "Ogbonna", "Anyanwu", "Ejiofor",
    "Akpan", "Bassey", "Idris", "Abdullahi", "Tijani", "Olaleye",
    "Nwankwo", "Omotosho", "Salami", "Duru", "Egbuna", "Agu",
    "Nweke", "Oyelaran", "Okechukwu",
]


def _hash(pw: str) -> str:
    return _bcrypt.hashpw(pw.encode("utf-8"), _bcrypt.gensalt()).decode("utf-8")


def _pick_name(index: int, prefix: str = ""):
    """Deterministic name pick based on index. Alternates male/female."""
    if index % 2 == 0:
        first = MALE_FIRST[index % len(MALE_FIRST)]
    else:
        first = FEMALE_FIRST[index % len(FEMALE_FIRST)]
    surname = SURNAMES[index % len(SURNAMES)]
    # Avoid duplicates by mixing in index-based offset for surname
    surname_idx = (index + index // len(SURNAMES)) % len(SURNAMES)
    surname = SURNAMES[surname_idx]
    full = f"{prefix}{first} {surname}"
    return first, surname, full


# ---------------------------------------------------------------------------
# Main
# ---------------------------------------------------------------------------
def main():
    print("=" * 60)
    print("  Maranatha Risk System — Test Data Seeder")
    print("=" * 60)

    Base.metadata.create_all(bind=engine)
    db = SessionLocal()

    try:
        # ── 1. Faculties ──────────────────────────────────────
        print("\n[1/10] Faculties...")
        faculty_map = {}  # code → id
        for f in FACULTIES:
            existing = db.query(models.Faculty).filter(
                models.Faculty.code == f["code"]
            ).first()
            if existing:
                faculty_map[f["code"]] = existing.id
                print(f"  [skip] {f['name']} already exists")
            else:
                fac = models.Faculty(name=f["name"], code=f["code"])
                db.add(fac)
                db.flush()
                faculty_map[f["code"]] = fac.id
                print(f"  [ok]   {f['name']}")

        # ── 2. Departments ────────────────────────────────────
        print("\n[2/10] Departments...")
        dept_map = {}  # code → id
        for d in DEPARTMENTS:
            # Check if old SWE code exists and needs updating
            if d["code"] == "SEN":
                old = db.query(models.Department).filter(
                    models.Department.code == "SWE"
                ).first()
                if old:
                    old.code = "SEN"
                    old.name = d["name"]
                    old.faculty_id = faculty_map.get(d["faculty"])
                    db.flush()
                    dept_map["SEN"] = old.id
                    print(f"  [fix]  Updated SWE -> SEN")
                    continue

            existing = db.query(models.Department).filter(
                models.Department.code == d["code"]
            ).first()
            if existing:
                dept_map[d["code"]] = existing.id
                # Ensure faculty link
                if not existing.faculty_id and d["faculty"] in faculty_map:
                    existing.faculty_id = faculty_map[d["faculty"]]
                print(f"  [skip] {d['name']} ({d['code']}) already exists")
            else:
                dept = models.Department(
                    name=d["name"],
                    code=d["code"],
                    faculty_id=faculty_map.get(d["faculty"]),
                )
                db.add(dept)
                db.flush()
                dept_map[d["code"]] = dept.id
                print(f"  [ok]   {d['name']} ({d['code']})")

        db.commit()

        # ── 3. Academic Session ───────────────────────────────
        print("\n[3/10] Academic Session...")
        session_label = "2025/2026"
        ac_session = db.query(models.AcademicSession).filter(
            models.AcademicSession.session_label == session_label
        ).first()

        # Also look for stale 2024/2025 session and migrate its dates
        old_session = db.query(models.AcademicSession).filter(
            models.AcademicSession.session_label == "2024/2025"
        ).first()
        if old_session and not ac_session:
            # Upgrade the old session in-place to 2025/2026 dates
            old_session.session_label = "2025/2026"
            old_session.start_date    = date(2025, 9, 7)   # First Sunday of Sept 2025
            old_session.end_date      = date(2026, 6, 28)  # End of academic year
            old_session.is_active     = True
            ac_session = old_session
            db.flush()
            print(f"  [ok]   Upgraded 2024/2025 → '2025/2026' (id={ac_session.id})")
        elif ac_session:
            # Update dates if stale
            if ac_session.start_date != date(2025, 9, 7) or ac_session.end_date != date(2026, 6, 28):
                ac_session.start_date = date(2025, 9, 7)
                ac_session.end_date   = date(2026, 6, 28)
                db.flush()
            print(f"  [skip] Session '{session_label}' already exists (id={ac_session.id})")
        else:
            # Deactivate any existing active sessions
            db.query(models.AcademicSession).filter(
                models.AcademicSession.is_active == True
            ).update({"is_active": False})
            ac_session = models.AcademicSession(
                session_label=session_label,
                semester=1,
                start_date=date(2025, 9, 7),   # First Sunday of Sept 2025
                end_date=date(2026, 6, 28),     # End of academic year
                is_active=True,
            )
            db.add(ac_session)
            db.flush()
            print(f"  [ok]   Created and activated '{session_label}' (id={ac_session.id})")

        # Make sure it's active
        if not ac_session.is_active:
            db.query(models.AcademicSession).filter(
                models.AcademicSession.is_active == True
            ).update({"is_active": False})
            ac_session.is_active = True

        db.commit()

        # ── 4 & 5. Students + Whitelist ───────────────────────
        print("\n[4/10] Student whitelist entries...")
        print("[5/10] Student accounts...")
        student_pw_hash = _hash(STUDENT_PASSWORD)
        students_data = []  # for CSV output
        student_count = 0
        skipped_students = 0

        # Level distribution for 10 students: 3 × L200, 4 × L300, 3 × L400
        level_pattern_10 = [200]*3 + [300]*4 + [400]*3
        year_for_level = {200: "24", 300: "23", 400: "22"}

        for dept_code in dept_map.keys():
            dept_id = dept_map[dept_code]
            count = 10
            level_pattern = level_pattern_10
            for i in range(count):
                level = level_pattern[i]
                yr = year_for_level[level]
                seq = f"{i+1:03d}"
                matric = f"{yr}/{dept_code}/{seq}"

                # Check if student already exists
                exists = db.query(models.User).filter(
                    models.User.matric_number == matric
                ).first()
                if exists:
                    skipped_students += 1
                    continue

                first, surname, full_name = _pick_name(student_count + i)
                email = f"{first.lower()}.{surname.lower()}.{dept_code.lower()}{seq}@stu.maranatha.edu.ng"

                # Whitelist
                wl_exists = db.query(models.StudentWhitelist).filter(
                    models.StudentWhitelist.matric_number == matric
                ).first()
                if not wl_exists:
                    db.add(models.StudentWhitelist(
                        matric_number=matric,
                        full_name=full_name,
                        department_id=dept_id,
                        is_used=True,
                    ))

                # User
                db.add(models.User(
                    full_name=full_name,
                    email=email,
                    matric_number=matric,
                    password_hash=student_pw_hash,
                    role="student",
                    department_id=dept_id,
                    level=level,
                    is_active=True,
                    email_confirmed=True,
                ))

                students_data.append({
                    "matric_number": matric,
                    "full_name": full_name,
                    "email": email,
                    "department": dept_code,
                    "level": level,
                    "password": STUDENT_PASSWORD,
                })

            student_count += count

        db.commit()
        print(f"  [ok]   Created {len(students_data)} students, skipped {skipped_students}")

        # ── 6 & 7. Lecturers + Whitelist ──────────────────────
        print("\n[6/10] Lecturer whitelist entries...")
        print("[7/10] Lecturer accounts...")
        lecturer_pw_hash = _hash(LECTURER_PASSWORD)
        lecturers_data = []
        lect_count = 0
        skipped_lecturers = 0

        # All 22 departments get exactly 5 lecturers each = 110 total
        dept_lect_counts = {}
        for dc in dept_map.keys():
            dept_lect_counts[dc] = 5

        # Title distribution: roughly 80% Dr., 20% Prof.
        global_lect_idx = 0

        for dept_code, count in dept_lect_counts.items():
            dept_id = dept_map[dept_code]
            for j in range(count):
                global_lect_idx += 1
                staff_id = f"STAFF/{global_lect_idx:03d}"

                exists = db.query(models.User).filter(
                    models.User.staff_id == staff_id
                ).first()
                if exists:
                    skipped_lecturers += 1
                    continue

                # Pick name with Dr./Prof. prefix
                prefix = "Prof. " if global_lect_idx % 5 == 0 else "Dr. "
                # Offset name pool to avoid collision with students
                name_idx = global_lect_idx + 100
                first, surname, _ = _pick_name(name_idx)
                full_name = f"{prefix}{first} {surname}"
                email = f"{first.lower()}.{surname.lower()}@staff.maranatha.edu.ng"

                # Ensure unique email by appending index if needed
                email_exists = db.query(models.User).filter(
                    models.User.email == email
                ).first()
                if email_exists:
                    email = f"{first.lower()}.{surname.lower()}{global_lect_idx}@staff.maranatha.edu.ng"

                # Check lecturer whitelist
                wl_exists = db.query(models.LecturerWhitelist).filter(
                    models.LecturerWhitelist.staff_id == staff_id
                ).first()
                if not wl_exists:
                    db.add(models.LecturerWhitelist(
                        full_name=full_name,
                        email=email,
                        staff_id=staff_id,
                        is_used=True,
                        expires_at=datetime.now(timezone.utc) + timedelta(days=365),
                    ))

                db.add(models.User(
                    full_name=full_name,
                    email=email,
                    staff_id=staff_id,
                    password_hash=lecturer_pw_hash,
                    role="lecturer",
                    department_id=dept_id,
                    is_active=True,
                    email_confirmed=True,
                ))

                lecturers_data.append({
                    "staff_id": staff_id,
                    "full_name": full_name,
                    "email": email,
                    "department": dept_code,
                    "password": LECTURER_PASSWORD,
                    "courses": "",  # filled in step 8
                })

        db.commit()
        print(f"  [ok]   Created {len(lecturers_data)} lecturers, skipped {skipped_lecturers}")

        # ── 8. Courses + Lecturer Assignment ──────────────────
        print("\n[8/10] Courses and lecturer assignments...")
        courses_created = 0
        courses_skipped = 0

        # Build a map of dept → lecturer user objects
        dept_lecturers = {}
        for dept_code in dept_map.keys():
            dept_id = dept_map[dept_code]
            dept_lecturers[dept_code] = db.query(models.User).filter(
                models.User.role == "lecturer",
                models.User.department_id == dept_id,
                models.User.is_active == True,
            ).all()

        # Track lecturer → courses for CSV
        lect_courses_map = {}  # staff_id → [course_codes]

        for dept_code, course_list in COURSES.items():
            dept_id = dept_map[dept_code]
            lecturers = dept_lecturers.get(dept_code, [])

            for ci, (code, title, level, units) in enumerate(course_list):
                existing = db.query(models.Course).filter(
                    models.Course.course_code == code,
                    models.Course.session_id == ac_session.id,
                ).first()
                if existing:
                    courses_skipped += 1
                    continue

                # Assign lecturer by round-robin
                lecturer_id = None
                if lecturers and ci < len(lecturers):
                    lecturer_id = lecturers[ci].id
                    sid = lecturers[ci].staff_id
                    lect_courses_map.setdefault(sid, []).append(code)

                course = models.Course(
                    course_code=code,
                    course_title=title,
                    credit_units=units,
                    level=level,
                    department_id=dept_id,
                    session_id=ac_session.id,
                    lecturer_id=lecturer_id,
                )
                db.add(course)
                courses_created += 1

        db.commit()
        print(f"  [ok]   Created {courses_created} courses, skipped {courses_skipped}")

        # Update lecturers_data with assigned courses
        for ld in lecturers_data:
            ld["courses"] = ", ".join(lect_courses_map.get(ld["staff_id"], []))

        # ── 9. Enrollments ────────────────────────────────────
        print("\n[9/10] Enrollments...")
        enrolled_count = 0
        skipped_enroll = 0

        for dept_code in dept_map.keys():
            dept_id = dept_map[dept_code]
            dept_courses = COURSES.get(dept_code, [])

            # Get students for this department
            students = db.query(models.User).filter(
                models.User.role == "student",
                models.User.department_id == dept_id,
                models.User.is_active == True,
            ).all()

            for student in students:
                # Enroll in all courses at their level
                for code, title, level, units in dept_courses:
                    if level != student.level:
                        continue

                    course = db.query(models.Course).filter(
                        models.Course.course_code == code,
                        models.Course.session_id == ac_session.id,
                    ).first()
                    if not course:
                        continue

                    # Check existing enrollment
                    exists = db.query(models.Enrollment).filter(
                        models.Enrollment.student_id == student.id,
                        models.Enrollment.course_id == course.id,
                        models.Enrollment.session_id == ac_session.id,
                    ).first()
                    if exists:
                        skipped_enroll += 1
                        continue

                    db.add(models.Enrollment(
                        student_id=student.id,
                        course_id=course.id,
                        session_id=ac_session.id,
                    ))
                    enrolled_count += 1

        db.commit()
        print(f"  [ok]   Created {enrolled_count} enrollments, skipped {skipped_enroll}")

        # ── 10. Output Files ──────────────────────────────────
        print("\n[10/10] Writing output files...")
        out_dir = os.path.dirname(__file__)

        # --- credentials txt ---
        creds_path = os.path.join(out_dir, "seed_credentials.txt")
        with open(creds_path, "w") as f:
            f.write("=" * 60 + "\n")
            f.write("  Maranatha Risk System — Test Credentials\n")
            f.write("=" * 60 + "\n\n")

            f.write("ADMIN ACCOUNT\n")
            f.write("-" * 40 + "\n")
            f.write("Staff ID : ADMIN/001\n")
            f.write("Password : <set via ADMIN_PASSWORD env var>\n\n")

            f.write(f"STUDENTS ({len(students_data)} accounts)\n")
            f.write(f"Password for all: {STUDENT_PASSWORD}\n")
            f.write("-" * 40 + "\n")
            f.write(f"{'Matric No':<18} {'Name':<30} {'Dept':<6} {'Level'}\n")
            f.write("-" * 40 + "\n")
            for s in students_data:
                f.write(f"{s['matric_number']:<18} {s['full_name']:<30} {s['department']:<6} {s['level']}\n")

            f.write(f"\n\nLECTURERS ({len(lecturers_data)} accounts)\n")
            f.write(f"Password for all: {LECTURER_PASSWORD}\n")
            f.write("-" * 40 + "\n")
            f.write(f"{'Staff ID':<12} {'Name':<30} {'Dept':<6} {'Courses'}\n")
            f.write("-" * 40 + "\n")
            for l in lecturers_data:
                f.write(f"{l['staff_id']:<12} {l['full_name']:<30} {l['department']:<6} {l['courses']}\n")

        print(f"  [ok]   {creds_path}")

        # --- students csv ---
        csv_students = os.path.join(out_dir, "seed_students.csv")
        with open(csv_students, "w", newline="") as f:
            w = csv.DictWriter(f, fieldnames=["matric_number", "full_name", "email", "department", "level"])
            w.writeheader()
            for s in students_data:
                w.writerow({k: s[k] for k in ["matric_number", "full_name", "email", "department", "level"]})
        print(f"  [ok]   {csv_students}")

        # --- lecturers csv ---
        csv_lecturers = os.path.join(out_dir, "seed_lecturers.csv")
        with open(csv_lecturers, "w", newline="") as f:
            w = csv.DictWriter(f, fieldnames=["staff_id", "full_name", "email", "department", "courses"])
            w.writeheader()
            for l in lecturers_data:
                w.writerow({k: l[k] for k in ["staff_id", "full_name", "email", "department", "courses"]})
        print(f"  [ok]   {csv_lecturers}")

        print("\n" + "=" * 60)
        print("  DONE! Summary:")
        print(f"    Students  : {len(students_data)}")
        print(f"    Lecturers : {len(lecturers_data)}")
        print(f"    Courses   : {courses_created}")
        print(f"    Enrollments: {enrolled_count}")
        print(f"\n  Credentials: {creds_path}")
        print("=" * 60)

    except Exception as e:
        db.rollback()
        print(f"\n[ERROR] {e}")
        raise
    finally:
        db.close()


if __name__ == "__main__":
    main()
