"""
AI Service — Anthropic Claude Integration (v2)

Provides AI-powered functions for the educational layer:
    1. generate_quiz_explanation      — explains correct answers after submission
    2. generate_intervention_message  — personalised support for at-risk students
    3. answer_student_question        — multi-turn course tutoring with conversation history
    4. explain_risk_in_plain_language  — SHAP-to-action risk explanation
    5. summarise_chat_discussion      — weekly chat summaries
    6. detect_question_for_tutor      — heuristic question detection (no API call)
    7. generate_quiz_from_material    — AI quiz generation from course material
    8. generate_weekly_study_plan     — placeholder for weekly study plans
    9. generate_lecturer_weekly_digest — placeholder for lecturer digests

All functions implement graceful degradation: when the API key is not
configured, a structured fallback response is returned.
"""

import json
import logging
import time as _time
from typing import Optional

from config import get_settings
from circuit_breaker import CircuitBreaker

log = logging.getLogger(__name__)
settings = get_settings()

CLAUDE_MODEL = "claude-sonnet-4-20250514"
MAX_TOKENS = 1000

_claude_circuit = CircuitBreaker(name="anthropic", failure_threshold=5, recovery_timeout=60)

# ── Singleton client ──────────────────────────────────────────────────────
_client = None


def _get_client():
    """Lazy-initialise and return the Anthropic client singleton."""
    global _client
    if _client is None:
        try:
            import anthropic
            _client = anthropic.Anthropic(
                api_key=settings.anthropic_api_key,
                timeout=15.0,
            )
        except Exception as e:
            log.error("Failed to initialise Anthropic client: %s", e)
            return None
    return _client


def _is_api_configured() -> bool:
    """Return True if a valid Anthropic API key is present in settings."""
    key = getattr(settings, "anthropic_api_key", None)
    if not key or not key.strip():
        return False
    key = key.strip()
    if not key.startswith("sk-ant-"):
        log.warning("ANTHROPIC_API_KEY does not look like a valid Anthropic key; ignoring.")
        return False
    return True


TONE_INSTRUCTIONS = {
    "encouraging": "\nIMPORTANT: Use a warm, encouraging, and supportive tone. Celebrate small wins and frame challenges as opportunities.",
    "neutral": "\nIMPORTANT: Use a neutral, factual, and professional tone. Present information clearly without emotional framing.",
    "minimal": "\nIMPORTANT: Be brief and direct. Use minimal words. Avoid motivational language. Give facts and actionable steps only.",
}


def _adapt_prompt_for_tone(system_prompt: str, tone: str = "encouraging") -> str:
    """Append tone instruction to the system prompt based on user preference."""
    instruction = TONE_INSTRUCTIONS.get(tone, TONE_INSTRUCTIONS["encouraging"])
    return system_prompt + instruction


def _call_claude(
    system_prompt: str,
    user_message: str,
    conversation_history: Optional[list] = None,
    max_tokens: int = MAX_TOKENS,
) -> Optional[str]:
    """
    Make a call to the Claude API, optionally with conversation history.

    Args:
        system_prompt:        Instructions defining Claude's role.
        user_message:         The current user request.
        conversation_history: Optional list of {"role": "user"|"assistant", "content": str}
                              for multi-turn conversations.
        max_tokens:           Override for max response tokens.

    Returns:
        The text response from Claude, or None on failure.
    """
    if not _claude_circuit.can_execute():
        log.warning("Circuit breaker OPEN — skipping Anthropic API call")
        return None

    client = _get_client()
    if client is None:
        return None

    messages = []
    if conversation_history:
        for msg in conversation_history:
            messages.append({
                "role": msg.get("role", "user"),
                "content": msg.get("content", ""),
            })
    messages.append({"role": "user", "content": user_message})

    last_error = None
    for attempt in range(3):
        try:
            response = client.messages.create(
                model=CLAUDE_MODEL,
                max_tokens=max_tokens,
                system=system_prompt,
                messages=messages,
            )
            _claude_circuit.record_success()
            return response.content[0].text
        except Exception as error:
            last_error = error
            log.warning("Claude API attempt %d/3 failed: %s", attempt + 1, error)
            if attempt < 2:
                _time.sleep(1.5 ** attempt)  # 1s, 1.5s backoff

    log.error("Claude API call failed after 3 attempts: %s", last_error)
    _claude_circuit.record_failure()
    return None


# ---------------------------------------------------------------------------
# 1. Quiz Answer Explanation
# ---------------------------------------------------------------------------

def generate_quiz_explanation(
    question_text: str,
    option_a: str,
    option_b: str,
    option_c: str,
    option_d: str,
    correct_option: str,
    student_answer: str,
    course_title: str,
) -> str:
    if not _is_api_configured():
        return (
            "Detailed explanations are available when the AI service is active. "
            "Review your course materials or ask your lecturer for clarification."
        )

    options_text = f"A: {option_a}\nB: {option_b}\nC: {option_c}\nD: {option_d}"

    system_prompt = (
        f"You are an academic tutor for a {course_title} course at a Nigerian university. "
        "Explain quiz answers clearly. 3-5 sentences max. Simple language, one practical tip. "
        "Be encouraging."
    )

    user_message = (
        f"Question: {question_text}\n\nOptions:\n{options_text}\n\n"
        f"Correct answer: Option {correct_option}\n"
        f"Student selected: Option {student_answer}\n\n"
        "Explain why the correct answer is right, why the student's choice was wrong, "
        "and give one tip for remembering this concept."
    )

    response = _call_claude(system_prompt, user_message)
    return response or f"The correct answer is Option {correct_option}. Review this topic in your course notes."


# ---------------------------------------------------------------------------
# 2. Personalised Intervention Message
# ---------------------------------------------------------------------------

def generate_intervention_message(
    student_name: str,
    course_title: str,
    risk_level: str,
    shap_explanation: dict,
    week_number: int,
    tone: str = "encouraging",
) -> str:
    if not _is_api_configured():
        return (
            f"Dear {student_name}, your engagement in {course_title} has been flagged "
            f"for academic support in week {week_number}. "
            "Please speak with your lecturer or academic adviser to discuss your progress."
        )

    risk_factors = []
    if shap_explanation:
        sorted_factors = sorted(shap_explanation.items(), key=lambda x: abs(x[1]), reverse=True)
        for feature, contribution in sorted_factors[:3]:
            direction = "low" if contribution > 0 else "strong"
            risk_factors.append(f"{direction} {feature.lower().replace('_', ' ')}")

    risk_factors_text = ", ".join(risk_factors) if risk_factors else "engagement patterns requiring attention"

    system_prompt = (
        "You are a supportive academic adviser at a Nigerian university. "
        "Warm, non-judgmental, action-oriented. Focus on what they can do now. "
        "150-200 words max."
    )

    user_message = (
        f"Name: {student_name}\nCourse: {course_title}\n"
        f"Risk level: {risk_level}\nWeek: {week_number}\n"
        f"Risk factors: {risk_factors_text}\n\n"
        "Acknowledge their situation, name 2-3 practical actions, "
        "end with encouragement about recovery."
    )

    response = _call_claude(_adapt_prompt_for_tone(system_prompt, tone), user_message)
    return response or (
        f"Dear {student_name}, your progress in {course_title} has been flagged "
        f"for support in week {week_number}. Please connect with your lecturer."
    )


# ---------------------------------------------------------------------------
# 3. Course-Aware Student Tutoring (multi-turn)
# ---------------------------------------------------------------------------

_COUNSELLOR_MODES = {
    "tutor": {
        "label": "Course Tutor",
        "description": "Answers academic questions using uploaded course materials.",
    },
    "advisor": {
        "label": "Academic Advisor",
        "description": "Reads your risk scores and engagement data to recommend priority actions.",
    },
    "coach": {
        "label": "Study Coach",
        "description": "Analyses your quiz patterns and study habits to suggest better techniques.",
    },
    "support": {
        "label": "Emotional Support",
        "description": "Validates feelings, highlights positives, and connects you with help if needed.",
    },
    "career": {
        "label": "Career Guidance",
        "description": "Explores career paths within your field and helps with academic-to-career planning.",
    },
}


def _build_advisor_prompt(course_title: str, student_context: dict, risk_courses: list) -> str:
    """System prompt for the Academic Advisor mode."""
    courses_summary = ""
    if risk_courses:
        courses_summary = "\n".join(
            f"- {r['course_code']}: risk={r['risk_level']}, week {r['week']}"
            for r in risk_courses
        )
    return (
        f"You are an Academic Advisor for a student at a Nigerian university "
        f"currently studying {course_title}.\n\n"
        f"## Student's Risk Profile Across Courses:\n{courses_summary or 'No risk data available.'}\n\n"
        "Your role:\n"
        "- Analyse which courses need the most urgent attention\n"
        "- Recommend a prioritised weekly study plan\n"
        "- Suggest concrete actions (attend next lecture, complete quizzes, visit office hours)\n"
        "- Be encouraging but realistic. Keep advice to 150-300 words.\n"
        "- Use Nigerian university context (GPA scale, course units, carryovers)."
    )


def _build_coach_prompt(course_title: str, student_context: dict, behavioural_data: dict) -> str:
    """System prompt for the Study Coach mode."""
    flags = []
    if behavioural_data:
        if behavioural_data.get("avg_guessing_rate", 0) > 0.3:
            flags.append(f"High guessing rate ({behavioural_data['avg_guessing_rate']:.0%})")
        if behavioural_data.get("avg_cramming_index", 0) > 0.7:
            flags.append("Cramming pattern detected")
        if behavioural_data.get("avg_fatigue_index", 0) > 0.2:
            flags.append(f"Fatigue drop-off ({behavioural_data['avg_fatigue_index']:.0%})")
        if behavioural_data.get("avg_confidence", 0) < 0.5:
            flags.append("Low answer confidence (frequent answer changes)")
    flags_text = "\n".join(f"- {f}" for f in flags) if flags else "No quiz data available yet."
    no_data_clause = (
        ""
        if behavioural_data
        else (
            "\nNOTE: This student has not attempted enough quizzes for pattern analysis. "
            "Give general evidence-based study advice instead.\n"
        )
    )
    return (
        f"You are a Study Coach for a student at a Nigerian university "
        f"studying {course_title}.\n\n"
        f"## Detected Study Patterns:\n{flags_text}\n{no_data_clause}\n"
        "Your role:\n"
        "- Explain what each pattern means in plain language\n"
        "- Recommend specific study techniques (spaced repetition, active recall, Pomodoro, etc.)\n"
        "- Suggest how to prepare for quizzes and exams based on their patterns\n"
        "- Be practical — give step-by-step advice they can start today\n"
        "- Keep to 150-300 words."
    )


def _build_support_prompt(course_title: str, student_context: dict) -> str:
    """System prompt for the Emotional Support mode."""
    positives = []
    if student_context:
        if student_context.get("attendance_rate") and student_context["attendance_rate"] > 0.6:
            positives.append(f"decent attendance ({student_context['attendance_rate']:.0%})")
        if student_context.get("quiz_avg") and student_context["quiz_avg"] > 0.5:
            positives.append(f"solid quiz performance ({student_context['quiz_avg']:.0%})")
    positives_text = ", ".join(positives) if positives else "showing effort by engaging with the system"
    return (
        f"You are a supportive wellbeing companion for a student studying "
        f"{course_title} at a Nigerian university.\n\n"
        f"Positive data points: {positives_text}.\n\n"
        "Your role:\n"
        "- Validate the student's feelings — what they feel is real and okay\n"
        "- Highlight their positive engagement data to build confidence\n"
        "- Suggest manageable next steps (one small win at a time)\n"
        "- NEVER attempt clinical counselling or diagnose anything\n"
        "- If they express serious distress, gently encourage speaking with:\n"
        "  • Their course advisor or HOD\n"
        "  • The university counselling centre\n"
        "  • A trusted family member or friend\n"
        "- Be warm, human, and concise (100-250 words)."
    )


def _build_career_prompt(course_title: str) -> str:
    """System prompt for the Career Guidance mode."""
    return (
        f"You are a Career Guidance counsellor for a student studying "
        f"{course_title} at a Nigerian university.\n\n"
        "Your role:\n"
        "- Help them explore career paths related to their field of study\n"
        "- Discuss industry trends in the Nigerian and global context\n"
        "- Suggest skills, certifications, or projects they can pursue alongside their degree\n"
        "- If they express doubts about their programme, explore options constructively "
        "(changing department, combining skills, etc.) — never dismiss their concerns\n"
        "- Mention relevant Nigerian companies, tech ecosystem, and professional bodies\n"
        "- Keep to 150-300 words."
    )


def answer_student_question(
    student_question: str,
    course_title: str,
    course_materials_text: Optional[str] = None,
    conversation_history: Optional[list] = None,
    student_context: Optional[dict] = None,
    mode: str = "tutor",
    risk_courses: Optional[list] = None,
    behavioural_data: Optional[dict] = None,
    tone: str = "encouraging",
) -> dict:
    """
    Answer a student's academic question with optional conversation history.

    Modes:
    - tutor   – Course Tutor (default): uses uploaded materials
    - advisor – Academic Advisor: reads risk scores, recommends priority actions
    - coach   – Study Coach: analyses quiz behavioural patterns, suggests techniques
    - support – Emotional Support: validates feelings, highlights positives
    - career  – Career Guidance: explores career paths within their field

    Returns dict: {"answer": str, "distress_flag": bool}
    """
    if not _is_api_configured():
        return {
            "answer": (
                "The AI tutoring service is not currently active. "
                "Please refer to your course materials or visit your lecturer during office hours."
            ),
            "distress_flag": False,
        }

    # ── Mode-specific system prompts ──────────────────────────────────────
    if mode == "advisor":
        system_prompt = _build_advisor_prompt(course_title, student_context or {}, risk_courses or [])
        context = f"Student question: {student_question}"
    elif mode == "coach":
        system_prompt = _build_coach_prompt(course_title, student_context or {}, behavioural_data or {})
        context = f"Student question: {student_question}"
    elif mode == "support":
        system_prompt = _build_support_prompt(course_title, student_context or {})
        context = f"Student says: {student_question}"
    elif mode == "career":
        system_prompt = _build_career_prompt(course_title)
        context = f"Student question: {student_question}"
    else:
        # Default tutor mode — open-book with source attribution
        if course_materials_text:
            # Smart 40k-char window: full text if fits, else first+last 20k
            if len(course_materials_text) <= 40000:
                truncated = course_materials_text
            else:
                truncated = (
                    course_materials_text[:20000]
                    + "\n\n[...middle section omitted for brevity...]\n\n"
                    + course_materials_text[-20000:]
                )
            context = (
                f"Course materials for {course_title}:\n\n{truncated}\n\n"
                f"Student question: {student_question}"
            )
            system_prompt = (
                f"You are a Course Tutor for {course_title} at Maranatha University, Nigeria. "
                "PRIMARY: When the course materials provided answer a question, prioritise them — "
                "especially for exam-relevant content. Prefix such answers with "
                "'From your course materials:'. "
                "SECONDARY: If materials are silent on a topic, incomplete, or the student wants "
                "a clearer explanation, use your own knowledge freely. Prefix with 'Using my knowledge:'. "
                "Nigerian examples where helpful. 150-400 words. End with one follow-up question. "
                "If the question is completely off-topic, politely redirect. "
                "If you know a relevant freely-accessible resource (Khan Academy, MIT OpenCourseWare, "
                "GeeksforGeeks), mention it at the end as 'Suggested Resource:'."
            )
        else:
            context = f"Student question: {student_question}"
            system_prompt = (
                f"You are a Course Tutor for {course_title} at Maranatha University, Nigeria. "
                "Your lecturer has not yet uploaded materials for this course. "
                "Use your own knowledge to answer academic questions about this subject. "
                "Label every answer with 'Using my knowledge:' so the student knows this is "
                "general knowledge, not from their lecturer's materials. "
                "Encourage the student to ask their lecturer or check the university library "
                "for course-specific notes. "
                "Nigerian examples where helpful. 150-400 words. End with one follow-up question. "
                "If you know a relevant freely-accessible resource (Khan Academy, MIT OpenCourseWare, "
                "GeeksforGeeks), mention it at the end as 'Suggested Resource:'."
            )

    # Inject student risk context for all modes
    if student_context and mode in ("tutor", "advisor", "coach", "support", "career"):
        risk_level = student_context.get("risk_level", "Unknown")
        attendance = student_context.get("attendance_rate")
        quiz_avg = student_context.get("quiz_avg")
        mood = student_context.get("mood_score")
        risk_prob = student_context.get("risk_probability")
        top_factors = student_context.get("top_risk_factors", [])
        ctx_parts = [f"Student's current risk level: {risk_level}."]
        if risk_prob is not None:
            ctx_parts.append(f"Risk probability: {risk_prob:.1%}.")
        if attendance is not None:
            ctx_parts.append(f"Attendance: {attendance:.0%}.")
        if quiz_avg is not None:
            ctx_parts.append(f"Quiz average: {quiz_avg:.0%}.")
        if mood is not None:
            mood_label = "confident" if mood > 0.6 else "unsure" if mood > 0.3 else "struggling"
            ctx_parts.append(f"Recent mood: {mood_label}.")
        if top_factors:
            ctx_parts.append(f"Top risk drivers: {', '.join(top_factors)}.")
        system_prompt += (
            "\n\nIMPORTANT CONTEXT: " + " ".join(ctx_parts) +
            " Tailor your encouragement and advice to this student's situation. "
            "If their risk is High, be extra supportive and suggest concrete next steps. "
            "Proactively address their top risk factors in your responses."
        )

    # Inject quiz weak topics (tutor mode only)
    if student_context and student_context.get("weak_quiz_topics"):
        topics_str = ", ".join(student_context["weak_quiz_topics"])
        system_prompt += (
            f"\n\nQUIZ CONTEXT: This student recently answered incorrectly on these topics: "
            f"{topics_str}. If their question relates to any of these, acknowledge it and "
            "tailor your explanation to address their specific gap."
        )

    # Distress detection instruction (all modes)
    system_prompt += (
        "\n\nSAFETY: If the student's message suggests serious distress (suicidal thoughts, "
        "self-harm, extreme hopelessness, giving up entirely), you MUST start your response "
        "with exactly [DISTRESS_FLAG] on its own line before your supportive response. "
        "Never attempt professional counselling. Encourage them to speak with a trusted person."
    )

    response = _call_claude(
        _adapt_prompt_for_tone(system_prompt, tone),
        context,
        conversation_history=conversation_history,
    )
    response_text = response or "Unable to generate a response. Please try again or consult your materials."

    # Check for distress flag
    distress_flag = False
    if response_text.startswith("[DISTRESS_FLAG]"):
        distress_flag = True
        response_text = response_text.replace("[DISTRESS_FLAG]", "").strip()

    return {"answer": response_text, "distress_flag": distress_flag}


# ---------------------------------------------------------------------------
# 4. Plain-Language Risk Explanation (SHAP-to-action mapping)
# ---------------------------------------------------------------------------

# Maps SHAP features to actionable advice
_SHAP_ACTION_MAP = {
    "attendance_rate": "attend your next lecture",
    "quiz_average": "take the next quiz and review past questions",
    "assignment_submission_rate": "submit your outstanding assignments",
    "late_submission_rate": "submit your next assignment before the deadline",
    "login_frequency": "log into the platform more regularly",
    "consecutive_absences": "break the absence streak by attending class",
    "mood_score": "check in on how you're feeling and talk to someone",
    "sgpa": "focus on your study habits and seek tutoring",
    "study_time": "increase your study sessions this week",
}


def explain_risk_in_plain_language(
    shap_explanation: dict,
    student_name: str,
    course_title: str,
    risk_level: str,
    week_number: int,
) -> str:
    try:
        risk_factors = []
        protective_factors = []
        action_items = []

        if shap_explanation:
            sorted_items = sorted(
                shap_explanation.items(),
                key=lambda x: abs(float(x[1])),
                reverse=True,
            )
            for feature, contribution in sorted_items:
                label = feature.lower().replace("_", " ")
                if float(contribution) > 0:
                    risk_factors.append(label)
                    action = _SHAP_ACTION_MAP.get(feature.lower(), f"improve your {label}")
                    action_items.append(action)
                else:
                    protective_factors.append(label)

        top_risks = risk_factors[:2]
        top_protective = protective_factors[:1]
        top_actions = action_items[:2]

        if not _is_api_configured():
            risk_text = " and ".join(top_risks) if top_risks else "your recent engagement patterns"
            protect_text = (
                f"Your {top_protective[0]} is working in your favour. "
                if top_protective else ""
            )
            action_text = (
                f"This week, try to {' and '.join(top_actions)}. "
                if top_actions else ""
            )
            urgency = (
                "It is important to act now."
                if risk_level == "High"
                else "Addressing this early makes a real difference."
            )
            return (
                f"Hi {student_name}, in week {week_number} of {course_title} "
                f"your risk level is {risk_level}. "
                f"The main areas contributing to this are {risk_text}. "
                f"{protect_text}{action_text}{urgency}"
            )

        risk_text = ", ".join(top_risks) if top_risks else "engagement patterns"
        protect_text = ", ".join(top_protective) if top_protective else "none identified yet"
        action_text = "; ".join(top_actions) if top_actions else "engage more with your course"

        system_prompt = (
            "You are a caring academic adviser. Explain the risk score in plain, warm language. "
            "Never use SHAP, probability, or machine learning terms. "
            "3-5 sentences. Acknowledge positives, name concerns gently, "
            "close with a concrete action the student can take today."
        )

        user_message = (
            f"Student: {student_name}\nCourse: {course_title}\n"
            f"Week: {week_number}\nRisk level: {risk_level}\n"
            f"Concerns: {risk_text}\nPositives: {protect_text}\n"
            f"Suggested actions: {action_text}\n\n"
            "Write 3-5 warm sentences with actionable advice."
        )

        response = _call_claude(system_prompt, user_message)
        if response:
            return response

        risk_txt = " and ".join(top_risks) if top_risks else "your recent engagement"
        return (
            f"Hi {student_name}, your {risk_level.lower()} risk in {course_title} "
            f"is mainly influenced by {risk_txt}. Please talk to your lecturer."
        )

    except Exception as exc:
        log.error("explain_risk_in_plain_language failed: %s", exc)
        return "We could not generate a personalised explanation right now."


# ---------------------------------------------------------------------------
# 5. Chat Discussion Summary
# ---------------------------------------------------------------------------

def summarise_chat_discussion(messages_text: str, course_title: str) -> str:
    if not _is_api_configured():
        return "AI summary is not available. Review the chat history manually."

    system_prompt = (
        f"Analyse student discussions from {course_title}. "
        "Summarise: Main Topics, Common Questions, Areas of Confusion, "
        "Notable Engagement, Suggested Actions. 2-3 bullets each."
    )

    response = _call_claude(system_prompt, messages_text)
    return response or "Unable to generate discussion summary."


# ---------------------------------------------------------------------------
# 6. Academic Question Detection (no API call)
# ---------------------------------------------------------------------------

def detect_question_for_tutor(message_content: str, course_title: str) -> dict:
    if "?" not in message_content and len(message_content) < 20:
        return {"is_academic_question": False, "confidence": 0, "suggested_query": ""}

    academic_keywords = [
        "how", "what", "why", "explain", "define", "calculate",
        "difference between", "example of", "formula", "proof",
        "algorithm", "function", "syntax", "error", "code",
    ]
    content_lower = message_content.lower()
    keyword_match = any(kw in content_lower for kw in academic_keywords)

    if keyword_match and "?" in message_content:
        return {"is_academic_question": True, "confidence": 0.8, "suggested_query": message_content}
    return {"is_academic_question": False, "confidence": 0, "suggested_query": ""}


# ---------------------------------------------------------------------------
# 7. AI Quiz Generation from Course Material
# ---------------------------------------------------------------------------

def generate_quiz_from_material(
    course_title: str,
    material_text: str,
    num_questions: int = 5,
    difficulty: str = "medium",
) -> list[dict]:
    """
    Generate MCQ questions from course material text.

    Returns list of dicts with keys: question_text, option_a, option_b,
    option_c, option_d, correct_option, explanation, why_wrong,
    read_topic, youtube_query, difficulty.

    Falls back to empty list if API not configured.
    """
    if not _is_api_configured():
        return []

    truncated = material_text[:20000]

    system_prompt = (
        f"You are a quiz generator for {course_title}. Generate exactly {num_questions} "
        f"multiple choice questions at {difficulty} difficulty from the provided material.\n\n"
        "Return ONLY valid JSON — an array of objects with these exact keys:\n"
        "- question_text: the question\n"
        "- option_a, option_b, option_c, option_d: four answer choices\n"
        "- correct_option: single letter a/b/c/d\n"
        "- explanation: why the correct answer is right (2-3 sentences)\n"
        '- why_wrong: object like {"a": "reason", "b": "reason"} for wrong options only\n'
        "- read_topic: the topic to review (max 10 words)\n"
        "- youtube_query: a search query for a relevant video\n"
        f'- difficulty: "{difficulty}"\n\n'
        "No markdown fences. Just the JSON array."
    )

    response = _call_claude(system_prompt, truncated, max_tokens=3000)
    if not response:
        return []

    try:
        # Strip markdown fences if present
        text = response.strip()
        if text.startswith("```"):
            text = text.split("\n", 1)[1] if "\n" in text else text[3:]
        if text.endswith("```"):
            text = text[:-3]
        text = text.strip()

        questions = json.loads(text)
        if isinstance(questions, list):
            return questions
    except (json.JSONDecodeError, ValueError) as e:
        log.error("Failed to parse AI quiz response: %s", e)

    return []


# ---------------------------------------------------------------------------
# 8. Weekly Study Plan (placeholder)
# ---------------------------------------------------------------------------

def generate_weekly_study_plan(
    student_name: str,
    risk_scores: list[dict],
    deadlines: list[dict],
) -> str:
    """Generate a personalised weekly study plan. Returns fallback when API key not set."""
    if not _is_api_configured():
        return (
            f"Hi {student_name}, the AI study planner is not currently active. "
            "Review your upcoming deadlines and focus on courses where your risk is highest."
        )

    courses_text = "\n".join(
        f"- {s.get('course_title', 'Unknown')}: risk={s.get('risk_level', 'N/A')}"
        for s in risk_scores
    )
    deadlines_text = "\n".join(
        f"- {d.get('title', 'Task')} due {d.get('due_date', 'TBD')}"
        for d in deadlines
    )

    system_prompt = (
        "You are an academic coach creating a weekly study plan for a university student. "
        "Prioritise high-risk courses. Include specific study blocks. Be realistic. 200 words max."
    )
    user_message = (
        f"Name: {student_name}\n\nCourses and risk:\n{courses_text}\n\n"
        f"Upcoming deadlines:\n{deadlines_text}\n\n"
        "Create a 7-day study plan with specific time allocations."
    )

    response = _call_claude(system_prompt, user_message, max_tokens=1500)
    return response or f"Unable to generate a study plan. Focus on your highest-risk courses."


# ---------------------------------------------------------------------------
# 9. Lecturer Weekly Digest (placeholder)
# ---------------------------------------------------------------------------

def generate_lecturer_weekly_digest(
    lecturer_name: str,
    course_stats: list[dict],
) -> str:
    """Generate a weekly performance digest for lecturers. Returns fallback when API not set."""
    if not _is_api_configured():
        return (
            f"Hello {lecturer_name}, the AI digest service is not currently active. "
            "Check the Students & Risk page for your latest course analytics."
        )

    stats_text = "\n".join(
        f"- {s.get('course_title', 'Unknown')}: {s.get('high_risk', 0)} high risk, "
        f"{s.get('medium_risk', 0)} medium, avg attendance {s.get('avg_attendance', 'N/A')}%"
        for s in course_stats
    )

    system_prompt = (
        "You are an academic analytics assistant. Write a concise weekly summary for a lecturer. "
        "Highlight courses needing attention, trends, and recommended actions. 150 words max."
    )
    user_message = f"Lecturer: {lecturer_name}\n\nCourse statistics:\n{stats_text}"

    response = _call_claude(system_prompt, user_message)
    return response or f"Unable to generate digest. Check the dashboard for your latest stats."


# ---------------------------------------------------------------------------
# 10. Self-Study Quiz Generation
# ---------------------------------------------------------------------------

def generate_self_study_quiz(
    topic: str,
    difficulty: str = "intermediate",
    course_title: Optional[str] = None,
    num_questions: int = 10,
) -> list:
    """
    Generate MCQ questions for self-study on a topic.
    Returns a list of dicts: [{question, options: [A,B,C,D], correct, topic_tag, explanation}]
    """
    if not _is_api_configured():
        return []

    context = f" in the context of {course_title}" if course_title else ""
    system_prompt = (
        "You are an academic quiz generator. Generate multiple-choice questions "
        "suitable for a Nigerian university undergraduate student."
    )
    user_message = (
        f"Generate exactly {num_questions} multiple-choice questions about '{topic}'"
        f"{context} at {difficulty} difficulty.\n\n"
        "Return ONLY a JSON array. Each element must have:\n"
        '{"question": "...", "options": ["A. ...", "B. ...", "C. ...", "D. ..."], '
        '"correct": "A", "topic_tag": "sub-topic name", "explanation": "why the correct answer is right"}\n\n'
        "Ensure questions test different aspects of the topic. "
        "Include conceptual, application, and analytical questions."
    )

    raw = _call_claude(system_prompt, user_message, max_tokens=2000)
    if not raw:
        return []

    try:
        json_start = raw.find("[")
        json_end = raw.rfind("]") + 1
        if json_start >= 0 and json_end > json_start:
            questions = json.loads(raw[json_start:json_end])
            return questions if isinstance(questions, list) else []
    except (json.JSONDecodeError, KeyError):
        log.warning("Failed to parse self-study quiz JSON")
    return []


# ---------------------------------------------------------------------------
# 11. Deep Per-Question Feedback
# ---------------------------------------------------------------------------

def generate_deep_quiz_feedback(
    questions_and_answers: list,
    topic: str,
    course_title: Optional[str] = None,
) -> str:
    """
    Generate detailed feedback for each question the student answered.
    questions_and_answers: [{question, student_answer, correct_answer, is_correct}]
    """
    if not _is_api_configured():
        return "AI feedback is not currently available."

    qa_text = ""
    for i, qa in enumerate(questions_and_answers[:10], 1):
        status = "CORRECT" if qa.get("is_correct") else "INCORRECT"
        qa_text += (
            f"\n{i}. {qa['question']}\n"
            f"   Student answered: {qa.get('student_answer', 'N/A')} ({status})\n"
            f"   Correct answer: {qa.get('correct_answer', 'N/A')}\n"
        )

    context = f" ({course_title})" if course_title else ""
    system_prompt = (
        "You are an academic tutor providing detailed feedback on quiz answers. "
        "Be specific, encouraging, and educational."
    )
    user_message = (
        f"Topic: {topic}{context}\n\n"
        f"Student's answers:{qa_text}\n\n"
        "For each INCORRECT answer, explain:\n"
        "1. Why their answer is wrong\n"
        "2. Why the correct answer is right\n"
        "3. A memorable way to remember this concept\n\n"
        "For CORRECT answers, briefly reinforce why it's right.\n"
        "End with 2-3 overall study recommendations."
    )

    response = _call_claude(system_prompt, user_message, max_tokens=1500)
    return response or "Unable to generate feedback. Please try again."


# ---------------------------------------------------------------------------
# 12. Document Viewer — AI Interactions
# ---------------------------------------------------------------------------

def explain_material_selection(
    selected_text: str,
    page_context: Optional[str] = None,
    course_title: Optional[str] = None,
    interaction_type: str = "explain",
) -> str:
    """
    AI explains, gives examples, or relates selected text from a course material.
    interaction_type: explain | example | relate
    """
    if not _is_api_configured():
        return "AI service is not currently available."

    context_hint = f" from the course {course_title}" if course_title else ""
    type_instructions = {
        "explain": "Explain this concept in simple terms with an analogy. 100-200 words.",
        "example": "Give a practical, real-world example of this concept. Use Nigerian context where helpful. 100-200 words.",
        "relate": "Explain how this concept connects to other topics the student might know. 100-200 words.",
    }
    instruction = type_instructions.get(interaction_type, type_instructions["explain"])

    system_prompt = (
        f"You are a study assistant helping a student understand material{context_hint}. "
        f"{instruction}"
    )
    user_message = f"Selected text:\n\"{selected_text}\""
    if page_context:
        user_message += f"\n\nSurrounding context:\n{page_context[:1000]}"

    response = _call_claude(system_prompt, user_message, max_tokens=500)
    return response or "Unable to generate explanation. Please try again."


def generate_listen_mode_summary(
    page_text: str,
    course_title: Optional[str] = None,
) -> str:
    """Generate a conversational summary of a page/section for 'listen mode'."""
    if not _is_api_configured():
        return "AI service is not currently available."

    context = f" for the course {course_title}" if course_title else ""
    system_prompt = (
        f"You are a friendly study companion summarising lecture material{context}. "
        "Re-explain the content in a conversational, easy-to-understand way as if "
        "you're talking to a friend. Use bullet points for key concepts. "
        "Keep to 200-300 words."
    )

    response = _call_claude(system_prompt, page_text[:8000], max_tokens=600)
    return response or "Unable to generate summary. Please try again."


def generate_proactive_checkin_message(
    student_name: str,
    risk_level: str,
    week_number: int,
    top_factors: list,
) -> str:
    """Generate a short proactive mid-week AI check-in for an at-risk student."""
    factors_text = ", ".join(top_factors[:3]) if top_factors else "academic engagement"

    if not _is_api_configured():
        return (
            f"Hi {student_name}, this is your mid-week check-in. "
            f"Your risk level is {risk_level} in week {week_number}. "
            f"We noticed concerns around {factors_text}. "
            "Please visit your AI tutor for personalised guidance."
        )

    system_prompt = (
        "You are a warm, encouraging academic support AI at a Nigerian university. "
        "Write a short (80-100 words) proactive mid-week check-in message for an at-risk student. "
        "Be supportive, not alarming. Mention 1-2 specific actions they can take today. "
        "End with a motivating sentence."
    )
    user_message = (
        f"Student: {student_name}\n"
        f"Risk level: {risk_level}\n"
        f"Week: {week_number}\n"
        f"Key concern areas: {factors_text}\n\n"
        "Write the check-in message now."
    )

    response = _call_claude(system_prompt, user_message, max_tokens=200)
    return response or (
        f"Hi {student_name}, checking in for week {week_number}. "
        f"Your {risk_level} risk status and {factors_text} need attention. "
        "Visit your AI Tutor for support."
    )

