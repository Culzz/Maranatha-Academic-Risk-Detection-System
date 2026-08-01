# AI Integration — Claude API

This document describes how the Maranatha Academic Risk System integrates with Anthropic's Claude API to provide AI-powered educational features.

## Overview

The system uses **Claude Sonnet 4** (`claude-sonnet-4-6`) via the Anthropic Python SDK to deliver 9 distinct AI functions. All AI calls are wrapped in a **circuit breaker** (3 retries with exponential backoff; see Circuit Breaker section). The AI tutor context window was expanded in Session 14 from 3,000 characters to **~40,000 characters**, enabling full lecture note and class note injection alongside quiz weak-topic signals.

All AI features implement **graceful degradation** — when the API key is not configured or a request fails, meaningful fallback responses are returned so the system remains fully functional without AI.

## Architecture

```
Frontend Component
    ↓ API call
FastAPI Router (e.g. /students/ask-tutor)
    ↓
ai_service.py → _call_claude()
    ↓
circuit_breaker.py → _claude_circuit
    ↓
Anthropic SDK → Claude Sonnet 4
    ↓
Parsed response → JSON to frontend
```

### Key Design Decisions

| Decision | Rationale |
|----------|-----------|
| Singleton client | One `anthropic.Anthropic()` instance reused across all requests |
| 15s timeout | Prevents slow API calls from blocking the user |
| Circuit breaker | Shared `_claude_circuit` instance protects all 9 functions from cascade failure |
| 40k tutor context | Session 14 expansion — full lecture notes + class notes + weak topics fit in one call |
| Graceful degradation | System works without API key; fallbacks are meaningful, not generic errors |
| System prompts | Each function has a tailored system prompt for its educational role |

## AI Functions

### 1. Quiz Answer Explanation

- **Trigger:** Called automatically after quiz submission
- **Inputs:** Question text, student's chosen answer, correct answer, course title
- **Response format:** 3–5 sentence Socratic explanation prefixed with either `"From your course materials:"` (when relevant material was injected) or `"Using my knowledge:"` (when responding from general training)
- **Fallback:** Generic "The correct answer is Option X" message constructed without an API call

### 2. Personalised Intervention

- **Trigger:** Called when a new intervention record is created
- **Inputs:** Student's risk profile, top SHAP values, intervention type
- **Response format:** 150–200 word warm, action-oriented support message tailored to the student's highest-risk features
- **Fallback:** Template message with student name, course, and a generic action suggestion

### 3. Multi-turn AI Tutor

- **Endpoint:** `POST /api/students/ask-tutor`
- **Inputs:**
  - Conversation history (all prior turns in the session)
  - Up to 40,000 characters of smart context: lecture notes + shared class notes (selected by `_select_relevant_materials()`) + quiz weak topics injected into the system prompt
- **Response format:** Contextual explanation with material attribution prefix (`"From your course materials:"` or `"Using my knowledge:"`)
- **Context selection:** `_select_relevant_materials()` in `students.py` ranks available materials by BM25-style relevance to the student's question and fills the context budget greedily
- **Fallback:** Redirect to course materials or lecturer office hours

### 4. Risk Explanation (SHAP-to-Action)

- **Endpoint:** `GET /api/risk/my-risk` (explanation field)
- **Inputs:** `risk_score`, top SHAP values (feature name + contribution)
- **Response format:** Plain-language paragraph with Next Best Actions mapped from the top negative SHAP contributors via `_SHAP_ACTION_MAP`

| SHAP Feature | Action Mapping |
|---|---|
| `attendance_rate` | "attend your next lecture" |
| `quiz_average` | "take the next quiz and review past questions" |
| `assignment_submission_rate` | "submit your outstanding assignments" |
| `late_submission_rate` | "submit your next assignment before the deadline" |
| `login_frequency` | "log into the platform more regularly" |
| `consecutive_absences` | "break the absence streak by attending class" |
| `mood_score` | "check in on how you're feeling and talk to someone" |

- **Fallback:** Structured message built directly from the SHAP-to-action map without an API call; never exposes ML or SHAP terminology to the student

### 5. Chat Discussion Summary

- **Trigger:** `POST /api/chat/rooms/{id}/ai-summary`
- **Inputs:** Last N messages from the chat room, course title
- **Response format:** 3-sentence summary covering topics discussed, unresolved questions, and engagement level — displayed in the room header
- **Fallback:** "Review the chat history manually"

### 6. Academic Question Detection

- **Purpose:** Detect whether a chat message is an academic question worth routing to the AI tutor
- **Method:** Fully local — regex pattern matching plus question-mark detection. No API call is made
- **Keywords matched:** how, what, why, explain, define, calculate, algorithm, function, and others
- **Returns:** `{ is_academic_question: bool, confidence: float, suggested_query: str }`

### 7. AI Quiz Generation

- **Endpoint:** `POST /api/quizzes/generate`
- **Inputs:** Course topic, difficulty level, number of questions requested
- **Response format:** JSON array of question objects parsed and stored to the database:

```json
{
  "question_text": "...",
  "option_a": "...", "option_b": "...", "option_c": "...", "option_d": "...",
  "correct_option": "a",
  "explanation": "Why this answer is correct...",
  "why_wrong": { "b": "reason", "c": "reason", "d": "reason" },
  "read_topic": "Topic the student should review",
  "youtube_query": "Search query surfaced in Study Resources",
  "difficulty": "medium"
}
```

- **Max output tokens:** 1,500
- **JSON parsing:** Strips markdown code fences; falls back to an empty quiz list on `json.loads()` failure — never crashes the endpoint
- **Fallback:** Returns an empty question list with an explanatory message

### 8. Weekly Study Plan

- **Endpoint:** `GET /api/students/study-plan`
- **Inputs:** Student's risk snapshot, upcoming deadlines, weak quiz topics (from quiz history)
- **Response format:** 7-day structured plan in markdown, with daily time allocations and course priorities weighted by risk score
- **Max output tokens:** 1,500
- **Fallback:** Static 7-day template with the student's highest-risk course listed first

### 9. Lecturer Weekly Digest

- **Trigger:** Celery Beat job, Monday 07:30 UTC
- **Inputs:** Cohort risk summary, list of at-risk students, pending interventions awaiting response
- **Response format:** Formatted ~150-word report delivered via the admin notification system to relevant lecturers and administrators
- **Fallback:** Raw stats table delivered without narrative prose if Claude is unavailable

---

## Context Window Management (Session 14)

The AI tutor context budget was expanded from 3,000 to 40,000 characters in Session 14 to support meaningful material injection.

| Slot | Content | Approximate budget |
|------|---------|-------------------|
| System prompt | Role instructions, tone, attribution rules | ~500 chars |
| Lecture notes | Top-N ranked by relevance to the student's question | Up to 30,000 chars |
| Shared class notes | Community notes for the course | Up to 5,000 chars |
| Quiz weak topics | Topics the student has scored below threshold on | Up to 2,000 chars |
| Conversation history | Prior turns in this tutor session | Remaining budget |

**Relevance ranking:** `_select_relevant_materials()` in `students.py` scores each available material against the student's current question using BM25-style term overlap, then fills slots greedily from the highest-scoring material downward until the budget is consumed.

**Attribution rule:** If material content was injected into the context window, the response must begin with `"From your course materials:"`. If the model answers from general training alone, it begins with `"Using my knowledge:"`. This rule is enforced in the system prompt.

---

## Tone Adaptation

Students can set a personal tone preference from their profile settings:

| Preference | Effect |
|------------|--------|
| `encouraging` | Warm, motivational phrasing; acknowledges effort explicitly |
| `neutral` | Calm, factual, supportive — the default |
| `minimal` | Concise; no hedging language or motivational phrases |

`_adapt_prompt_for_tone()` in `ai_service.py` adjusts the system prompt phrasing before every AI tutor call. The tone preference is read from the student's profile record and passed in from the router.

---

## Circuit Breaker

Implemented in `circuit_breaker.py`. All 9 AI functions use the shared `_claude_circuit` instance.

| State | Behaviour |
|-------|-----------|
| CLOSED | Normal operation; calls pass through |
| OPEN | Fast-fail; all calls return fallback immediately without hitting the API |
| HALF_OPEN | One test call is allowed through to check for recovery |

**Thresholds:**
- 5 consecutive failures → transitions to OPEN
- 60 seconds in OPEN state before transitioning to HALF_OPEN
- 1 successful call from HALF_OPEN → transitions back to CLOSED

When the circuit is OPEN, a structured fallback response is returned. The circuit state is in-process (not persisted to Redis); it resets on worker restart.

---

## Cost Management

| Control | Implementation |
|---------|---------------|
| No streaming | Simpler response handling; predictable billing |
| Output token limits | Quiz gen: 1,500 tokens; tutor: 2,000 tokens; digest: 1,000 tokens |
| Lazy client init | Anthropic client only instantiated on the first AI call |
| Local question detection | Function 6 is fully local — zero API cost |
| User-triggered only | AI calls are made only when a user explicitly triggers them; the weekly digest (Function 9) is the sole background AI call |
| Material relevance selection | `_select_relevant_materials()` avoids sending all materials blindly, keeping prompts focused |

---

## Security Considerations

- **API Key:** Stored in `.env` as `ANTHROPIC_API_KEY`; never exposed to the frontend
- **Key validation:** Checked for `sk-ant-` prefix before any API call is attempted
- **Input handling:** User inputs are passed as the `user_message` parameter — they are not interpolated into system prompts
- **Error logging:** API failures are logged server-side; error detail is never forwarded to the client
- **No PII leakage:** Student names are used for personalisation; raw grade records and SHAP values are the primary analytical data, not embedded in prompts verbatim

---

## Configuration

```env
# .env (backend/)
ANTHROPIC_API_KEY=sk-ant-your-key-here
```

When the key is empty or invalid, all AI functions return structured fallback responses. The system is fully functional without AI — it degrades gracefully rather than failing.

---

## Testing AI Functions

```bash
# Generate a quiz (requires running backend)
curl -X POST http://localhost:8011/api/quizzes/generate \
  -H "Authorization: Bearer <token>" \
  -H "Content-Type: application/json" \
  -d '{"course_id": 1, "topic": "Database normalisation", "num_questions": 5}'

# Ask the AI tutor
curl -X POST http://localhost:8011/api/students/ask-tutor \
  -H "Authorization: Bearer <token>" \
  -H "Content-Type: application/json" \
  -d '{"message": "Explain 3NF with an example", "course_id": 1}'

# Test fallback mode (no API key)
# In the backend shell:
unset ANTHROPIC_API_KEY
python -c "from ai_service import generate_quiz_explanation; print(generate_quiz_explanation('Q?','A','B','C','D','a','b','CSC301'))"

# Test with a valid key
export ANTHROPIC_API_KEY=sk-ant-...
python -c "from ai_service import answer_student_question; print(answer_student_question('What is OOP?', 'CSC301'))"
```
