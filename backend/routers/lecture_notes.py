"""Lecture speech-to-notes — students record audio → AI structures notes."""

import os
import uuid
from fastapi import APIRouter, Depends, HTTPException, UploadFile, File, Form
from sqlalchemy.orm import Session
from pydantic import BaseModel, Field
from typing import Optional

from security import require_role
from database import get_db
import app_models as models

router = APIRouter(prefix="/lecture-notes", tags=["lecture-notes"])

UPLOAD_DIR = os.path.join(os.path.dirname(os.path.dirname(__file__)), "uploads", "audio")
os.makedirs(UPLOAD_DIR, exist_ok=True)


class NoteCreate(BaseModel):
    course_id: int
    title: str = Field("Untitled Note", max_length=200)
    raw_transcript: str = ""


class NoteUpdate(BaseModel):
    title: Optional[str] = Field(None, max_length=200)
    raw_transcript: Optional[str] = None


def _note_dict(n):
    return {
        "id": n.id,
        "student_id": str(n.student_id),
        "course_id": n.course_id,
        "title": n.title,
        "raw_transcript": n.raw_transcript,
        "structured_notes": n.structured_notes,
        "recorded_at": n.recorded_at.isoformat() if n.recorded_at else None,
    }


@router.get("/")
def list_notes(
    course_id: int = None,
    current_user: models.User = Depends(require_role("student")),
    db: Session = Depends(get_db),
):
    """List the current student's lecture notes, optionally filtered by course."""
    q = db.query(models.LectureNote).filter(
        models.LectureNote.student_id == current_user.id
    )
    if course_id:
        q = q.filter(models.LectureNote.course_id == course_id)
    notes = q.order_by(models.LectureNote.recorded_at.desc()).all()
    return [_note_dict(n) for n in notes]


@router.post("/", status_code=201)
def create_note(
    payload: NoteCreate,
    current_user: models.User = Depends(require_role("student")),
    db: Session = Depends(get_db),
):
    """Save a new lecture note (raw transcript from speech recognition)."""
    note = models.LectureNote(
        student_id=current_user.id,
        course_id=payload.course_id,
        title=payload.title,
        raw_transcript=payload.raw_transcript,
    )
    db.add(note)
    db.commit()
    db.refresh(note)
    return _note_dict(note)


@router.post("/{note_id}/generate")
def generate_structured_notes(
    note_id: int,
    current_user: models.User = Depends(require_role("student")),
    db: Session = Depends(get_db),
):
    """Use Claude AI to convert raw transcript into structured study notes."""
    note = db.query(models.LectureNote).filter(
        models.LectureNote.id == note_id,
        models.LectureNote.student_id == current_user.id,
    ).first()
    if not note:
        raise HTTPException(status_code=404, detail="Note not found.")
    if not note.raw_transcript or len(note.raw_transcript.strip()) < 50:
        raise HTTPException(status_code=400, detail="Transcript too short to generate notes (minimum 50 characters).")

    # Call Claude to structure the notes
    try:
        from ai_service import get_ai_client
        client = get_ai_client()
        if not client:
            raise HTTPException(status_code=503, detail="AI service unavailable.")

        response = client.messages.create(
            model="claude-sonnet-4-20250514",
            max_tokens=2000,
            system="You are an academic note-taker. Convert this lecture transcript into clean, structured notes with headings, key terms bolded, and bullet points. Identify and list any definitions, formulas, or examples. Keep it under 200 words per topic. Use markdown formatting.",
            messages=[{"role": "user", "content": note.raw_transcript}],
        )
        structured = response.content[0].text
    except HTTPException:
        raise
    except Exception as exc:
        raise HTTPException(status_code=500, detail=f"AI generation failed: {exc}")

    note.structured_notes = structured
    db.commit()
    db.refresh(note)
    return _note_dict(note)


@router.delete("/{note_id}")
def delete_note(
    note_id: int,
    current_user: models.User = Depends(require_role("student")),
    db: Session = Depends(get_db),
):
    """Delete a student's own lecture note."""
    note = db.query(models.LectureNote).filter(
        models.LectureNote.id == note_id,
        models.LectureNote.student_id == current_user.id,
    ).first()
    if not note:
        raise HTTPException(status_code=404, detail="Note not found.")
    db.delete(note)
    db.commit()
    return {"message": "Note deleted."}


@router.post("/upload-audio", status_code=201)
def upload_audio_note(
    file: UploadFile = File(...),
    course_id: int = Form(...),
    title: str = Form("Audio Recording"),
    current_user: models.User = Depends(require_role("student")),
    db: Session = Depends(get_db),
):
    """Upload an audio file (webm/wav/mp3) and transcribe with OpenAI Whisper."""
    ext = (file.filename or "audio.webm").rsplit(".", 1)[-1].lower()
    if ext not in ("webm", "wav", "mp3", "m4a", "ogg", "flac"):
        raise HTTPException(400, "Supported audio: webm, wav, mp3, m4a, ogg, flac.")

    # Save audio file
    fname = f"lecture_{current_user.id}_{uuid.uuid4().hex[:8]}.{ext}"
    fpath = os.path.join(UPLOAD_DIR, fname)
    audio_bytes = file.file.read()
    with open(fpath, "wb") as f:
        f.write(audio_bytes)

    # Transcribe with OpenAI Whisper
    transcript = ""
    try:
        import openai
        client = openai.OpenAI()  # Uses OPENAI_API_KEY from env
        with open(fpath, "rb") as af:
            result = client.audio.transcriptions.create(
                model="whisper-1",
                file=af,
                language="en",
            )
        transcript = result.text or ""
    except ImportError:
        # openai not installed — save audio, transcript stays blank
        transcript = "[Whisper not available — install openai package]"
    except Exception as exc:
        transcript = f"[Transcription failed: {exc}]"

    # Create the note with transcript
    note = models.LectureNote(
        student_id=current_user.id,
        course_id=course_id,
        title=title,
        raw_transcript=transcript,
        audio_file_path=fpath,
        duration_seconds=None,
    )
    db.add(note)
    db.commit()
    db.refresh(note)

    return {
        **_note_dict(note),
        "audio_file": fname,
        "transcript_length": len(transcript),
    }
