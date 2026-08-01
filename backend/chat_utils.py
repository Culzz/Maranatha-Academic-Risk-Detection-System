"""
Chat utility functions.

Provides auto-room creation and membership management for the chat system.
Rooms are lazily created when first accessed and members are automatically
added when students enrol in courses.
"""

from sqlalchemy.orm import Session
import app_models as models


def get_or_create_course_rooms(course_id: int, session_id: int, db: Session) -> dict:
    """
    Ensure both chat rooms exist for a course in a session.

    Called on:
    - First time any user accesses chat for this course
    - When enrollments are created (auto-add students)
    - When a course is created by admin

    Returns:
        { "student_group": ChatRoom, "lecturer_channel": ChatRoom }
    """
    rooms = {}

    for room_type in ["student_group", "lecturer_channel"]:
        room = db.query(models.ChatRoom).filter(
            models.ChatRoom.course_id == course_id,
            models.ChatRoom.session_id == session_id,
            models.ChatRoom.room_type == room_type,
        ).first()

        if not room:
            course = db.query(models.Course).filter(models.Course.id == course_id).first()
            if not course:
                continue

            if room_type == "student_group":
                name = f"StudentHub {course.course_code}"
                desc = f"Students-only discussion for {course.course_title}"
            else:
                name = f"ClassHub {course.course_code}"
                desc = f"Lecturer + students channel for {course.course_title}"

            room = models.ChatRoom(
                course_id=course_id,
                session_id=session_id,
                room_type=room_type,
                name=name,
                description=desc,
            )
            db.add(room)
            db.flush()  # get room.id

            # Add the lecturer as owner of ClassHub only (not StudentHub)
            if course.lecturer_id and room_type == "lecturer_channel":
                member = models.ChatRoomMember(
                    room_id=room.id,
                    user_id=course.lecturer_id,
                    role="owner",
                )
                db.add(member)

            # Auto-add all enrolled students as members
            enrollments = db.query(models.Enrollment).filter(
                models.Enrollment.course_id == course_id,
                models.Enrollment.session_id == session_id,
            ).all()

            for enrollment in enrollments:
                existing = db.query(models.ChatRoomMember).filter(
                    models.ChatRoomMember.room_id == room.id,
                    models.ChatRoomMember.user_id == enrollment.student_id,
                ).first()
                if not existing:
                    member = models.ChatRoomMember(
                        room_id=room.id,
                        user_id=enrollment.student_id,
                        role="member",
                    )
                    db.add(member)

            db.commit()

        rooms[room_type] = room

    return rooms


def add_student_to_course_rooms(student_id, course_id: int, session_id: int, db: Session):
    """
    Called when a student is enrolled in a course.
    Auto-adds them to both chat rooms for that course.
    """
    rooms = get_or_create_course_rooms(course_id, session_id, db)

    for room_type, room in rooms.items():
        existing = db.query(models.ChatRoomMember).filter(
            models.ChatRoomMember.room_id == room.id,
            models.ChatRoomMember.user_id == student_id,
        ).first()
        if not existing:
            member = models.ChatRoomMember(
                room_id=room.id,
                user_id=student_id,
                role="member",
            )
            db.add(member)

    db.commit()
