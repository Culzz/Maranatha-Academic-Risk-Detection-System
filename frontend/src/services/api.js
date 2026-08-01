/**
 * API Service Layer
 * Every single fetch call in the app goes through here.
 * No component ever calls fetch() directly.
 *
 * Pattern:
 *   const data = await api.auth.login(email, password)
 *   const data = await api.risk.getForStudent(studentId, token)
 */

const BASE = "/api";
const DEFAULT_TIMEOUT_MS = 15000;
const ADMIN_LONG_TIMEOUT_MS = 120000;
const COMPUTE_TIMEOUT_MS = 180000;

// ── In-flight GET request deduplication ──────────
const _inflight = new Map();

// ── Compatibility shim (replaces utils/api.js) ──────────
// Admin pages use api.get/post/patch/delete object pattern.
export const BASE_URL = BASE;

export class ApiError extends Error {
  constructor(message, status) {
    super(message);
    this.name = "ApiError";
    this.status = status;
  }
}

export const api = {
  get:    (path, opts = {})       => request(path, { method: "GET",    ...opts }),
  post:   (path, body, opts = {}) => request(path, { method: "POST",   body, ...opts }),
  put:    (path, body, opts = {}) => request(path, { method: "PUT",    body, ...opts }),
  patch:  (path, body, opts = {}) => request(path, { method: "PATCH",  body, ...opts }),
  delete: (path, opts = {})       => request(path, { method: "DELETE", ...opts }),
};

export async function apiFetch(path, opts = {}) {
  return request(path, opts);
}

function getAuthStorage() {
  try {
    if (sessionStorage.getItem("auth_refresh_token") || sessionStorage.getItem("auth_token")) {
      return sessionStorage;
    }
    if (localStorage.getItem("auth_refresh_token") || localStorage.getItem("auth_token")) {
      return localStorage;
    }
  } catch {}
  return localStorage;
}

function dispatchServerError(status, path) {
  if (typeof window === "undefined") return;
  window.dispatchEvent(new CustomEvent("api:server-error", {
    detail: { status, path },
  }));
}

function _normalizeTimeoutMs(timeoutMs) {
  if (Number.isFinite(timeoutMs) && timeoutMs > 0) {
    return Math.floor(timeoutMs);
  }
  return DEFAULT_TIMEOUT_MS;
}

async function performFetch(path, options) {
  try {
    return await fetch(`${BASE}${path}`, options);
  } catch (error) {
    if (error?.name !== "AbortError") {
      dispatchServerError(0, path);
    }
    throw error;
  }
}

async function performFetchWithTimeout(path, options, timeoutMs, parentSignal) {
  const resolvedTimeoutMs = _normalizeTimeoutMs(timeoutMs);
  const timeoutController = new AbortController();
  let timedOut = false;
  const timeoutId = setTimeout(() => {
    timedOut = true;
    timeoutController.abort();
  }, resolvedTimeoutMs);

  let upstreamAbortHandler = null;
  if (parentSignal) {
    if (parentSignal.aborted) {
      timeoutController.abort();
    } else {
      upstreamAbortHandler = () => timeoutController.abort();
      parentSignal.addEventListener("abort", upstreamAbortHandler, { once: true });
    }
  }

  try {
    return await performFetch(path, { ...options, signal: timeoutController.signal });
  } catch (error) {
    if (timedOut && error?.name === "AbortError") {
      throw new ApiError(`Request timed out after ${resolvedTimeoutMs}ms.`, 408);
    }
    throw error;
  } finally {
    clearTimeout(timeoutId);
    if (parentSignal && upstreamAbortHandler) {
      parentSignal.removeEventListener("abort", upstreamAbortHandler);
    }
  }
}

// Track in-flight refresh to avoid parallel refresh calls
let _refreshPromise = null;

async function _tryRefresh() {
  const storage = getAuthStorage();
  let rt = null;
  try {
    rt = storage.getItem("auth_refresh_token");
  } catch {}
  if (!rt) return null;

  try {
    const res = await fetch(`${BASE}/auth/refresh`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ refresh_token: rt }),
    });
    if (!res.ok) return null;
    const raw = await res.json();
    // Unwrap envelope if middleware wrapped the response
    const data = (raw && raw.success && raw.data) ? raw.data : raw;
    // Persist new tokens
    storage.setItem("auth_token", data.access_token);
    if (data.refresh_token) storage.setItem("auth_refresh_token", data.refresh_token);
    // Notify React context so in-memory token state stays in sync
    window.dispatchEvent(new CustomEvent("auth:tokens-refreshed", {
      detail: { access_token: data.access_token, refresh_token: data.refresh_token || "" },
    }));
    return data.access_token;
  } catch {
    return null;
  }
}

// Generic request helper — with 401 interception and token refresh
async function _doRequest(path, { method = "GET", body, token, form, signal, timeoutMs } = {}) {
  const headers = {};
  if (token) headers["Authorization"] = `Bearer ${token}`;

  let fetchBody;
  if (form) {
    fetchBody = form; // FormData — browser sets Content-Type automatically
  } else if (body) {
    headers["Content-Type"] = "application/json";
    fetchBody = JSON.stringify(body);
  }

  let res = await performFetchWithTimeout(
    path,
    { method, headers, body: fetchBody },
    timeoutMs,
    signal,
  );

  // 401 — attempt one transparent refresh
  if (res.status === 401 && token && !path.includes("/auth/refresh")) {
    if (!_refreshPromise) _refreshPromise = _tryRefresh().finally(() => { _refreshPromise = null; });
    const newToken = await _refreshPromise;
    if (newToken) {
      // Retry original request with new token
      const retryHeaders = { ...headers, Authorization: `Bearer ${newToken}` };
      res = await performFetchWithTimeout(
        path,
        { method, headers: retryHeaders, body: fetchBody },
        timeoutMs,
        signal,
      );
    } else {
      // Refresh failed — force logout
      window.dispatchEvent(new CustomEvent("auth:logout"));
      throw new Error("Session expired. Please log in again.");
    }
  }

  let data = {};
  try {
    data = await res.json();
  } catch {
    data = {};
  }
  if (!res.ok) {
    if (res.status >= 500) {
      dispatchServerError(res.status, path);
    }
    // Standard envelope: {"success": false, "error": "..."}
    // Legacy format: {"detail": "..."}
    const msg = data.error
      || (Array.isArray(data.detail)
          ? data.detail.map(d => d.msg || d.message || JSON.stringify(d)).join("; ")
          : data.detail)
      || `Request failed: ${res.status}`;
    throw new ApiError(msg, res.status);
  }
  // Unwrap standard envelope if present, otherwise return raw data
  if (data && typeof data === "object" && "success" in data && "data" in data) {
    return data.data;
  }
  return data;
}

// Deduplication wrapper — concurrent identical GET requests share a single fetch
async function request(path, { method = "GET", body, token, form, signal, timeoutMs } = {}) {
  if (method === "GET") {
    const dedupeKey = `${path}|${token || ""}|${_normalizeTimeoutMs(timeoutMs)}`;
    if (_inflight.has(dedupeKey)) {
      return _inflight.get(dedupeKey);
    }
    const promise = _doRequest(path, { method, body, token, form, signal, timeoutMs })
      .finally(() => _inflight.delete(dedupeKey));
    _inflight.set(dedupeKey, promise);
    return promise;
  }
  return _doRequest(path, { method, body, token, form, signal, timeoutMs });
}

// ── Auth ──────────────────────────────────────────────────
export const authApi = {
  /** Login with email or matric number + password */
  login: (identifier, password) => {
    const form = new FormData();
    form.append("username", identifier);
    form.append("password", password);
    return request("/auth/login", { method: "POST", form });
  },

  /** Register a new student or lecturer */
  register: (payload) =>
    request("/auth/register", { method: "POST", body: payload }),

  /** Validate matric number against admin-seeded whitelist */
  validateMatric: (matric_number, full_name) =>
    request("/auth/validate-matric", { method: "POST", body: { matric_number, full_name } }),
};

// ── Students ──────────────────────────────────────────────
export const studentsApi = {
  getProfile: (token) =>
    request("/students/me", { token }),

  getOverview: (token) =>
    request("/students/overview", { token }),

  getRiskScores: (token) =>
    request("/students/my-risk", { token }),

  getMyCourses: (token) =>
    request("/students/my-courses", { token }),

  getEngagement: (token) =>
    request(`/students/my-engagement`, { token }),

  submitAttendanceCode: (code, courseId, token) =>
    request(`/attendance/mark`, { method: "POST", body: { session_code: code }, token }),

  getMyAttendance: (token) =>
    request("/attendance/my-attendance", { token }),

  signalConfusion: (sessionId, token) =>
    request(`/attendance/sessions/${sessionId}/confusion-signal`, { method: "POST", token }),

  submitAssignment: (assignmentId, formData, token) =>
    request(`/assignments/${assignmentId}/submit`, { method: "POST", form: formData, token }),

  getAssignments: (token) =>
    request("/students/me/assignments", { token }),

  getAiReview: (submissionId, token) =>
    request(`/assignments/submissions/${submissionId}/ai-review`, { token }),

  getQuizzes: (token) =>
    request("/students/me/quizzes", { token }),

  getQuizQuestions: (quizId, token) =>
    request(`/quizzes/${quizId}/questions`, { token }),

  submitQuiz: (quizId, payload, token) =>
    request(`/quizzes/${quizId}/submit`, { method: "POST", body: payload, token }),

  askTutor: (courseId, question, token, conversationHistory = null, mode = "tutor") =>
    request(`/students/ask`, {
      method: "POST",
      body: {
        course_id: Number(courseId),
        question,
        mode,
        ...(conversationHistory && conversationHistory.length > 0
          ? { conversation_history: conversationHistory }
          : {}),
      },
      token,
    }),

  getInterventions: (token) =>
    request("/students/my-interventions", { token }),

  /** Acknowledge an intervention — will_act and need_help are required booleans */
  acknowledgeIntervention: (interventionId, payload, token) =>
    request(`/interventions/${interventionId}/acknowledge`, {
      method: "POST", body: payload, token,
    }),

  /** Submit a self-reflection entry (Killer Feature 4) */
  submitReflection: (payload, token) =>
    request("/students/me/reflections", { method: "POST", body: payload, token }),

  /** Self-Study quiz generation */
  generateSelfStudyQuiz: (topic, difficulty, courseId, token) =>
    request("/self-study/generate", {
      method: "POST",
      body: { topic, difficulty, ...(courseId ? { course_id: Number(courseId) } : {}) },
      token,
    }),

  /** Submit self-study quiz answers */
  submitSelfStudyQuiz: (quizId, answers, token) =>
    request(`/self-study/${quizId}/submit`, {
      method: "POST", body: { answers }, token,
    }),

  /** Get knowledge map */
  getKnowledgeMap: (token, courseId = null) =>
    request(`/self-study/knowledge-map${courseId ? `?course_id=${courseId}` : ""}`, { token }),

  /** Get self-study history */
  getSelfStudyHistory: (token) =>
    request("/self-study/history", { token }),

  /** Semester Roadmap */
  getSemesterRoadmap: (courseId, token) =>
    request(`/intelligence/roadmap/${courseId}`, { token }),

  /** Per-course material access stats */
  getMaterialStats: (token) =>
    request("/students/me/material-stats", { token }),

  /** Semester memory capsule */
  getSemesterCapsule: (token) =>
    request("/students/me/semester-capsule", { token }),

  /** Spaced Repetition */
  getSpacedRepDue: (token) =>
    request("/intelligence/spaced-repetition/due", { token }),

  getSpacedRepStats: (token) =>
    request("/intelligence/spaced-repetition/stats", { token }),

  answerSpacedRepCard: (cardId, selected, token) =>
    request(`/intelligence/spaced-repetition/${cardId}/answer`, {
      method: "POST", body: { selected }, token,
    }),

  /** Unified Day Schedule */
  getUnifiedSchedule: (date, token) =>
    request(`/schedule/unified${date ? `?date=${date}` : ""}`, { token }),

  /** Deadline Orchestrator */
  getDeadlineOverview: (token) =>
    request("/intelligence/deadline-orchestrator", { token }),

  /** Academic Portfolio */
  getAcademicPortfolio: (token) =>
    request("/intelligence/portfolio", { token }),

  /** AI Weekly Study Plan */
  getWeeklyPlan: (token) =>
    request("/students/weekly-plan", { token }),

  /** Verify QR attendance with optional GPS coordinates */
  verifyQrAttendance: (qrToken, latitude, longitude, token) =>
    request("/attendance/verify-qr", {
      method: "POST",
      body: { token: qrToken, latitude, longitude },
      token,
    }),
};

// ── Notifications ─────────────────────────────────────────
export const notificationsApi = {
  getAll: (token) =>
    request("/notifications/me", { token }),

  markRead: (id, token) =>
    request(`/notifications/${id}/read`, { method: "POST", token }),

  markAllRead: (token) =>
    request("/notifications/read-all", { method: "POST", token }),
};

// ── Lecturers ─────────────────────────────────────────────
export const lecturersApi = {
  getOverview: (token) =>
    request("/lecturers/overview", { token }),

  getCourses: (token) =>
    request("/lecturers/my-courses", { token }),

  getCourseStudents: (courseId, token) =>
    request(`/lecturers/courses/${courseId}/students`, { token }),

  getStudentDetail: (studentId, courseId, token) =>
    request(`/lecturers/students/${studentId}?course_id=${courseId}`, { token }),

  startAttendanceSession: (courseId, lectureDate, lectureNumber, expiryMinutes, token) =>
    request("/attendance/session", {
      method: "POST",
      body: { course_id: courseId, lecture_date: lectureDate, lecture_number: lectureNumber, expiry_minutes: expiryMinutes },
      token,
    }),

  getAttendanceSessions: (courseId, token) =>
    request(`/attendance/sessions?course_id=${courseId}`, { token }),

  createQuiz: (payload, token) =>
    request("/quizzes/", { method: "POST", body: payload, token }),

  getQuizResults: (quizId, token) =>
    request(`/quizzes/${quizId}/results`, { token }),

  createAssignment: (payload, token) =>
    request("/assignments/", { method: "POST", body: payload, token }),

  getSubmissions: (assignmentId, token) =>
    request(`/assignments/${assignmentId}/submissions`, { token }),

  markSubmission: (submissionId, score, feedback, token) =>
    request(`/assignments/submissions/${submissionId}/mark`, {
      method: "POST", body: { score, feedback }, token,
    }),

  uploadMaterial: (courseId, formData, token) =>
    request(`/courses/${courseId}/materials`, { method: "POST", form: formData, token }),

  getMaterials: (courseId, token) =>
    request(`/courses/${courseId}/materials`, { token }),

  /** Material Viewer API */
  viewMaterial: (materialId, token) =>
    request(`/materials/${materialId}/view`, { token }),

  updateMaterialProgress: (materialId, payload, token) =>
    request(`/materials/${materialId}/progress`, { method: "POST", body: payload, token }),

  getMaterialAnnotations: (materialId, token) =>
    request(`/materials/${materialId}/annotations`, { token }),

  getMaterialVersions: (materialId, token) =>
    request(`/materials/${materialId}/versions`, { token }),

  createMaterialAnnotation: (materialId, payload, token) =>
    request(`/materials/${materialId}/annotations`, { method: "POST", body: payload, token }),

  deleteMaterialAnnotation: (materialId, annotationId, token) =>
    request(`/materials/${materialId}/annotations/${annotationId}`, { method: "DELETE", token }),

  aiExplainMaterial: (materialId, payload, token) =>
    request(`/materials/${materialId}/ai-explain`, { method: "POST", body: payload, token }),

  aiListenMaterial: (materialId, payload, token) =>
    request(`/materials/${materialId}/ai-listen`, { method: "POST", body: payload, token }),

  /** Fetch material as authenticated blob URL for iframe embedding */
  getMaterialBlobUrl: async (materialId, token) => {
    const headers = { Authorization: `Bearer ${token}` };
    let res = await performFetch(`/materials/${materialId}/download`, { headers });
    if (res.status === 401) {
      if (!_refreshPromise) _refreshPromise = _tryRefresh().finally(() => { _refreshPromise = null; });
      const newToken = await _refreshPromise;
      if (newToken) {
        headers.Authorization = `Bearer ${newToken}`;
        res = await performFetch(`/materials/${materialId}/download`, { headers });
      } else {
        window.dispatchEvent(new CustomEvent("auth:logout"));
        throw new Error("Session expired.");
      }
    }
    if (!res.ok) throw new Error("Failed to load material");
    const blob = await res.blob();
    return URL.createObjectURL(blob);
  },

  getConfusionHeatmap: (materialId, token) =>
    request(`/materials/${materialId}/confusion-heatmap`, { token }),

  /** "I Don't Understand" confusion signal */
  reportConfusion: (materialId, token) =>
    request(`/materials/${materialId}/confused`, { method: "POST", token }),

  undoConfusion: (materialId, token) =>
    request(`/materials/${materialId}/confused`, { method: "DELETE", token }),

  getConfusionCount: (materialId, token) =>
    request(`/materials/${materialId}/confusion-count`, { token }),

  getInterventions: (courseId, token) =>
    request(`/lecturers/courses/${courseId}/interventions`, { token }),

  /** Generate AI intervention for a student in a course */
  generateIntervention: (studentId, courseId, token) =>
    request(`/interventions/generate/${studentId}/${courseId}`, { method: "POST", token }),

  /** Bulk-generate AI interventions for all High Risk students in a course */
  bulkGenerateInterventions: (courseId, token) =>
    request(`/interventions/bulk-generate/${courseId}`, { method: "POST", token }),

  /** Update intervention status (completed / dismissed) */
  updateIntervention: (interventionId, payload, token) =>
    request(`/interventions/${interventionId}`, { method: "PATCH", body: payload, token }),

  /** Get pending interventions across lecturer's courses */
  getPendingInterventions: (token) =>
    request("/interventions/pending", { token }),

  getReflections: (courseId, token) =>
    request(`/lecturers/courses/${courseId}/reflections`, { token }),

  getAssignments: (token) =>
    request("/lecturers/me/assignments", { token }),

  getQuizzes: (token) =>
    request("/lecturers/me/quizzes", { token }),

  deleteQuiz: (quizId, token) =>
    request(`/quizzes/${quizId}`, { method: "DELETE", token }),

  deleteMaterial: (materialId, token) =>
    request(`/materials/${materialId}`, { method: "DELETE", token }),

  downloadMaterial: async (materialId, filename, token) => {
    const headers = { Authorization: `Bearer ${token}` };
    let res = await performFetch(`/materials/${materialId}/download`, { headers });

    // Handle 401 with token refresh
    if (res.status === 401) {
      if (!_refreshPromise) _refreshPromise = _tryRefresh().finally(() => { _refreshPromise = null; });
      const newToken = await _refreshPromise;
      if (newToken) {
        headers.Authorization = `Bearer ${newToken}`;
        res = await performFetch(`/materials/${materialId}/download`, { headers });
      } else {
        window.dispatchEvent(new CustomEvent("auth:logout"));
        throw new Error("Session expired. Please log in again.");
      }
    }

    if (!res.ok) throw new Error("Download failed");
    const blob = await res.blob();
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = filename || "download";
    document.body.appendChild(a);
    a.click();
    a.remove();
    URL.revokeObjectURL(url);
  },

  /** Send a direct message to a student (receiver_id + content required) */
  sendMessage: (receiverId, content, courseId, token) =>
    request("/messages/", {
      method: "POST",
      body: { receiver_id: receiverId, content, course_id: courseId },
      token,
    }),

  /** Generate AI quiz questions from course materials */
  aiGenerateQuestions: (quizId, numQuestions, difficulty, token) =>
    request(`/quizzes/${quizId}/ai-generate?num_questions=${numQuestions}&difficulty=${encodeURIComponent(difficulty)}`, {
      method: "POST", token,
    }),

  /** Get current HMAC QR token for an attendance session */
  getQrToken: (sessionId, token) =>
    request(`/attendance/session/${sessionId}/qr-token`, { token }),

  /** Pre-lecture intelligence brief for a course */
  getPreLectureBrief: (courseId, token) =>
    request(`/lecturers/courses/${courseId}/pre-lecture-brief`, { token }),

  /** Pending interventions awaiting lecturer response > 3 days */
  getLecturerPendingInterventions: (token) =>
    request("/lecturers/pending-interventions", { token }),

  /** Student Deep Dive — AI narrative profile */
  getStudentDeepDive: (studentId, courseId, token) =>
    request(`/analytics/student-deep-dive/${studentId}${courseId ? `?course_id=${courseId}` : ""}`, { token }),

  /** Assignment Difficulty Calibrator */
  getAssignmentCalibration: (assignmentId, token) =>
    request(`/analytics/assignment-calibration/${assignmentId}`, { token }),

  // Lecture Notes
  getLectureNotes: (courseId, token) =>
    request(`/lecture-notes/${courseId ? `?course_id=${courseId}` : ""}`, { token }),
  createLectureNote: (data, token) =>
    request("/lecture-notes/", { method: "POST", body: data, token }),
  generateNotes: (noteId, token) =>
    request(`/lecture-notes/${noteId}/generate`, { method: "POST", token }),
  deleteLectureNote: (noteId, token) =>
    request(`/lecture-notes/${noteId}`, { method: "DELETE", token }),
  uploadAudioNote: (formData, token) =>
    request("/lecture-notes/upload-audio", { method: "POST", form: formData, token }),
  // Shared Notes
  getSharedNote: (courseId, week, token) =>
    request(`/courses/${courseId}/shared-notes?week=${week}`, { token }),
  saveSharedNote: (courseId, data, token) =>
    request(`/courses/${courseId}/shared-notes`, { method: "POST", body: data, token }),
};

// ── Admin ─────────────────────────────────────────────────
export const adminApi = {
  getOverviewDashboard: (token) =>
    request("/admin/overview-dashboard", { token }),

  getOverview: (token) =>
    request("/admin/overview", { token }),

  getUsers: (token) =>
    request("/admin/users", { token }),

  createUser: (payload, token) =>
    request("/admin/users", { method: "POST", body: payload, token }),

  toggleUser: (userId, token) =>
    request(`/admin/users/${userId}/toggle-active`, { method: "PATCH", token }),

  getCourses: (token) =>
    request("/admin/courses", { token }),

  createCourse: (payload, token) =>
    request("/admin/courses", { method: "POST", body: payload, token }),

  getDepartments: (token) =>
    request("/admin/departments", { token }),

  bulkEnroll: (formData, token) =>
    request("/enrollments/bulk-csv", { method: "POST", form: formData, token }),

  uploadWhitelist: (formData, token) =>
    request("/admin/students/whitelist", { method: "POST", form: formData, token }),

  getAuditLog: (token) =>
    request("/admin/audit-log", { token }),

  getModelPerformance: (token) =>
    request("/admin/model/performance", { token }),

  triggerRetrain: (token) =>
    request("/admin/model/retrain", { method: "POST", token, timeoutMs: ADMIN_LONG_TIMEOUT_MS }),

  getDepartmentRisk: (token) =>
    request("/admin/department-risk", { token }),

  getAcademicSessions: (token) =>
    request("/admin/academic-sessions", { token }),

  createAcademicSession: (payload, token) =>
    request("/admin/academic-sessions", { method: "POST", body: payload, token }),

  activateAcademicSession: (id, token) =>
    request(`/admin/academic-sessions/${id}/activate`, { method: "PATCH", token }),

  clearAcademicSessions: (token) =>
    request("/admin/academic-sessions/clear", { method: "DELETE", token }),

  assignLecturer: (courseId, lecturerId, token) =>
    request(`/admin/courses/${courseId}/assign-lecturer`, {
      method: "PATCH", body: { lecturer_id: lecturerId }, token,
    }),

  // Wave 2 additions
  getSettings:             (token)             => request("/admin/settings", { token }),
  updateSetting:           (key, value, token)  => request(`/admin/settings/${key}`, { method: "PATCH", body: { value }, token }),
  getSosDashboard:         (token)             => request("/admin/sos-dashboard", { token }),
  getStaffWorkload:        (token)             => request("/admin/staff-workload", { token }),
  getInterventionEfficacy: (token)             => request("/admin/intervention-efficacy", { token }),
  computeEngagement:       (token)             => request("/admin/compute-engagement", { method: "POST", token, timeoutMs: COMPUTE_TIMEOUT_MS }),
  computeRisk:             (token)             => request("/risk/compute-all", { method: "POST", token, timeoutMs: COMPUTE_TIMEOUT_MS }),

  // HOD Dashboard
  hodBroadcast:            (data, token)       => request("/admin/hod/broadcast", { method: "POST", body: data, token }),
  hodLecturerActivity:     (token)             => request("/admin/hod/lecturer-activity", { token }),

  // Intelligence reports
  getCrossCourseRisk:      (token)             => request("/admin/cross-course-risk", { token }),
  getEarlyWarning:         (token)             => request("/admin/early-warning", { token }),
  getInterventionOutcomes: (token)             => request("/admin/intervention-outcomes", { token }),
  getSosStats:             (token)             => request("/sos/stats", { token }),
  checkOverdueSos:         (token)             => request("/sos/check-overdue", { token }),

  // Department & Faculty CRUD
  getFaculties:            (token)             => request("/admin/faculties", { token }),
  createFaculty:           (payload, token)    => request("/admin/faculties", { method: "POST", body: payload, token }),
  updateFaculty:           (id, payload, token) => request(`/admin/faculties/${id}`, { method: "PATCH", body: payload, token }),
  deleteFaculty:           (id, token)         => request(`/admin/faculties/${id}`, { method: "DELETE", token }),
  getDepartmentsFull:      (token)             => request("/admin/departments-full", { token }),
  createDepartment:        (payload, token)    => request("/admin/departments", { method: "POST", body: payload, token }),
  updateDepartment:        (id, payload, token) => request(`/admin/departments/${id}`, { method: "PATCH", body: payload, token }),
  deleteDepartment:        (id, token)         => request(`/admin/departments/${id}`, { method: "DELETE", token }),

  /** Risk Thermometer */
  getRiskThermometer:      (token)             => request("/analytics/risk-thermometer", { token }),

  /** Cross-Course Risk Correlation */
  getCrossCourseAlerts:    (token)             => request("/analytics/cross-course-alerts", { token }),

  /** Intervention Effectiveness */
  getInterventionEffectiveness: (token)        => request("/analytics/intervention-effectiveness", { token }),

  /** Lecturer Effectiveness (Idea 14) */
  getLecturerEffectiveness:  (token)            => request("/analytics/lecturer-effectiveness", { token }),

  /** Accreditation Report (Idea 15) */
  getAccreditationReport:   (token)            => request("/analytics/accreditation-report", { token }),

  /** Semester Patterns (Idea 17) */
  getSemesterPatterns:      (token)            => request("/analytics/semester-patterns", { token }),
};

// ── Risk ──────────────────────────────────────────────────
export const riskApi = {
  getStudentRisk: (studentId, token) =>
    request(`/risk/student/${studentId}`, { token }),

  triggerPrediction: (studentId, courseId, token) =>
    request("/risk/compute", { method: "POST", body: { student_id: studentId, course_id: courseId }, token }),

  /** Explain risk score in plain language (Killer Feature 10) */
  explain: (payload, token) =>
    request("/risk/explain", { method: "POST", body: payload, token }),

  /** Get student's past what-if simulations */
  getMySimulations: (token) =>
    request("/risk/my-simulations", { token }),

  /** Optimal path grid search */
  getOptimalPath: (courseId, token) =>
    request(`/risk/simulate/optimal?course_id=${courseId}`, { method: "POST", token }),
};

// ══════════════════════════════════════════════════════════
// WAVE 2 API OBJECTS
// ══════════════════════════════════════════════════════════

// ── Profile ──────────────────────────────────────────────
export const profileApi = {
  getProfile:        (token)           => request("/profile/me", { token }),
  updateProfile:     (payload, token)  => request("/profile/me", { method: "PATCH", body: payload, token }),
  changePassword:    (payload, token)  => request("/profile/change-password", { method: "POST", body: payload, token }),
  uploadPicture:     (formData, token) => request("/profile/upload-picture", { method: "POST", form: formData, token }),
  getPreferences:    (token)           => request("/profile/preferences", { token }),
  updatePreferences: (payload, token)  => request("/profile/preferences", { method: "PATCH", body: payload, token }),
};

// ── Tasks ────────────────────────────────────────────────
export const tasksApi = {
  getMyTasks:    (token)                     => request("/tasks/my-tasks", { token }),
  createTask:    (payload, token)            => request("/tasks/", { method: "POST", body: payload, token }),
  completeTask:  (taskId, token)             => request(`/tasks/${taskId}/complete`, { method: "PATCH", token }),
  updateTask:    (taskId, payload, token)    => request(`/tasks/${taskId}`, { method: "PATCH", body: payload, token }),
  deleteTask:    (taskId, token)             => request(`/tasks/${taskId}`, { method: "DELETE", token }),
  broadcastTask: (payload, token)            => request("/tasks/broadcast", { method: "POST", body: payload, token }),
  broadcastHistory: (courseId, token)         => request(`/tasks/broadcast-history?course_id=${courseId}`, { token }),
};

// ── Checkins ─────────────────────────────────────────────
export const checkinsApi = {
  submitCheckin:     (payload, token)   => request("/checkins/", { method: "POST", body: payload, token }),
  getMyCheckins:     (token)           => request("/checkins/my-checkins", { token }),
  getCourseSummary:  (courseId, token)  => request(`/checkins/course/${courseId}/summary`, { token }),
  getCourseStudents: (courseId, token)  => request(`/checkins/course/${courseId}/students`, { token }),
};

// ── SOS ──────────────────────────────────────────────────
export const sosApi = {
  sendSos:          (payload, token)         => request("/sos/", { method: "POST", body: payload, token }),
  getMyRequests:    (token)                  => request("/sos/my-requests", { token }),
  getOpenRequests:  (token)                  => request("/sos/open", { token }),
  respond:          (sosId, payload, token)  => request(`/sos/${sosId}/respond`, { method: "POST", body: payload, token }),
  getResponseTimes: (token)                  => request("/sos/response-times", { token }),
};

// ── Schedule ─────────────────────────────────────────────
export const scheduleApi = {
  getMySchedule:     (token)              => request("/schedule/my-schedule", { token }),
  getCountdown:      (token)              => request("/schedule/countdown", { token }),
  getCourseSchedule: (courseId, token)     => request(`/schedule/course/${courseId}`, { token }),
  createEntry:       (payload, token)     => request("/schedule/", { method: "POST", body: payload, token }),
  deleteEntry:       (entryId, token)     => request(`/schedule/${entryId}`, { method: "DELETE", token }),
};

// ── Office Hours ─────────────────────────────────────────
export const officeHoursApi = {
  createSlot:         (payload, token)             => request("/office-hours/slots", { method: "POST", body: payload, token }),
  getMySlots:         (token)                      => request("/office-hours/slots/my-slots", { token }),
  getLecturerSlots:   (lecturerId, token)           => request(`/office-hours/slots/lecturer/${lecturerId}`, { token }),
  bookSlot:           (payload, token)              => request("/office-hours/bookings", { method: "POST", body: payload, token }),
  respondBooking:     (bookingId, payload, token)   => request(`/office-hours/bookings/${bookingId}/respond`, { method: "PATCH", body: payload, token }),
  getMyBookings:      (token)                      => request("/office-hours/bookings/my-bookings", { token }),
  getIncomingBookings:(token)                      => request("/office-hours/bookings/incoming", { token }),
};

// ── Peer Study ───────────────────────────────────────────
export const peerStudyApi = {
  getSuggestions: (courseId, token)           => request(`/peer-study/suggestions/${courseId}`, { token }),
  getGroups:      (courseId, token)           => request(`/peer-study/groups/${courseId}`, { token }),
  createGroup:    (payload, token)            => request("/peer-study/groups", { method: "POST", body: payload, token }),
  joinGroup:      (groupId, token)            => request(`/peer-study/groups/${groupId}/join`, { method: "POST", token }),
  messageGroup:   (groupId, content, token)   => request(`/peer-study/groups/${groupId}/message`, { method: "POST", body: { content }, token }),
  getGroupMessages: (groupId, token)          => request(`/peer-study/groups/${groupId}/messages`, { token }),
  sendGroupMessage: (groupId, content, token) => request(`/peer-study/groups/${groupId}/messages`, { method: "POST", body: { content }, token }),
  getGroupGoals:    (groupId, token)          => request(`/peer-study/groups/${groupId}/goals`, { token }),
  createGroupGoal:  (groupId, text, token)    => request(`/peer-study/groups/${groupId}/goals`, { method: "POST", body: { text }, token }),
  toggleGoal:       (groupId, goalId, token)  => request(`/peer-study/groups/${groupId}/goals/${goalId}`, { method: "PATCH", token }),
  logOutcome:       (groupId, payload, token) => request(`/peer-study/groups/${groupId}/log-outcome`, { method: "POST", body: payload, token }),
  getStats:         (groupId, token)          => request(`/peer-study/groups/${groupId}/stats`, { token }),
};

// ── Outcome Journals ─────────────────────────────────────
export const outcomesApi = {
  submit:            (payload, token) => request("/outcomes/", { method: "POST", body: payload, token }),
  getAdminSummary:   (token)          => request("/outcomes/admin-summary", { token }),
  getLecturerSummary:(token)          => request("/outcomes/lecturer-summary", { token }),
};

// ── Anonymous Insights (Idea 19) ────────────────────────
export const insightsApi = {
  getAnonymousInsights: (token) => request("/analytics/anonymous-insights", { token }),
};

// ── Voice Check-In (Idea 3) ─────────────────────────────
export const voiceCheckinApi = {
  processTranscript: (transcript, courseId, token) =>
    request(`/analytics/voice-checkin?transcript=${encodeURIComponent(transcript)}${courseId ? `&course_id=${courseId}` : ""}`, {
      method: "POST", token,
    }),
};

// ── Guardian Portal (Idea 20) ───────────────────────────
export const guardianApi = {
  getMyShares:     (token)                    => request("/guardian/my-shares", { token }),
  createShare:     (payload, token)           => request("/guardian/share", { method: "POST", body: payload, token }),
  updateShare:     (shareId, payload, token)  => request(`/guardian/${shareId}`, { method: "PATCH", body: payload, token }),
  revokeShare:     (shareId, token)           => request(`/guardian/${shareId}`, { method: "DELETE", token }),
  getSummary:      (shareId)                  => request(`/guardian/summary/${shareId}`),
};

// ── Risk Simulator ───────────────────────────────────────
export const simulatorApi = {
  simulate: (payload, token) => request("/risk/simulate", { method: "POST", body: payload, token }),
};

// ══════════════════════════════════════════════════════════
// WAVE 3 — Auth Overhaul + Real-Time + Quiz ML
// ══════════════════════════════════════════════════════════

// ── Admin Auth ───────────────────────────────────────────
export const adminAuthApi = {
  register:     (payload, token) => request("/auth/admin/register", { method: "POST", body: payload, token }),
  verifyOtp:    (payload)     => request("/auth/admin/verify-otp", { method: "POST", body: payload }),
  confirmEmail: (token)       => request("/auth/admin/confirm-email", { method: "POST", body: { token } }),
  getFaculties: ()            => request("/auth/admin/faculties"),
};

// ── Lecturer Auth ────────────────────────────────────────
export const lecturerAuthApi = {
  validateEmail: (email)      => request("/auth/lecturer/validate-email", { method: "POST", body: { email } }),
  register:      (payload)    => request("/auth/lecturer/register", { method: "POST", body: payload }),
};

// ── Student Auth (confirmations) ─────────────────────────
export const studentAuthApi = {
  confirmEmail: (token)       => request("/auth/confirm-email", { method: "POST", body: { token } }),
};

// ── Faculty ──────────────────────────────────────────────
export const facultyApi = {
  getAll: () => request("/auth/admin/faculties"),
};

// ── Quiz Patterns ────────────────────────────────────────
export const quizPatternsApi = {
  getPatterns: (studentId, token) => request(`/quizzes/patterns/${studentId}`, { token }),
  parseFile: (formData, token) => request("/quizzes/parse-file", { method: "POST", form: formData, token }),
};

// ══════════════════════════════════════════════════════════
// WAVE 3 — Chat System
// ══════════════════════════════════════════════════════════

export const chatApi = {
  // Rooms
  getMyRooms:          (token) => request("/chat/rooms/my-rooms", { token }),
  getRoomMembers:      (roomId, token) => request(`/chat/rooms/${roomId}/members`, { token }),
  updateRoomSettings:  (roomId, payload, token) => request(`/chat/rooms/${roomId}/settings`, { method: "PATCH", body: payload, token }),

  // Messages
  getMessages:         (roomId, page, token) => request(`/chat/rooms/${roomId}/messages?page=${page}&limit=50`, { token }),
  sendMessage:         (roomId, payload, token) => request(`/chat/rooms/${roomId}/messages`, { method: "POST", body: payload, token }),
  uploadFile:          (roomId, formData, token) => request(`/chat/rooms/${roomId}/upload`, { method: "POST", form: formData, token }),
  editMessage:         (messageId, content, token) => request(`/chat/messages/${messageId}`, { method: "PATCH", body: { content }, token }),
  deleteMessage:       (messageId, token) => request(`/chat/messages/${messageId}`, { method: "DELETE", token }),

  // Reactions
  reactToMessage:      (messageId, emoji, token) => request(`/chat/messages/${messageId}/react`, { method: "POST", body: { emoji }, token }),

  // Pins
  togglePin:           (roomId, messageId, token) => request(`/chat/rooms/${roomId}/pin/${messageId}`, { method: "POST", token }),
  getPinnedMessages:   (roomId, token) => request(`/chat/rooms/${roomId}/pinned`, { token }),

  // Read receipts
  markRead:            (roomId, lastMessageId, token) => request(`/chat/rooms/${roomId}/read?last_read_message_id=${lastMessageId}`, { method: "POST", token }),

  // Search
  searchMessages:      (roomId, query, token) => request(`/chat/rooms/${roomId}/search`, { method: "POST", body: { query, room_id: roomId }, token }),

  // Polls
  createPoll:          (roomId, payload, token) => request(`/chat/rooms/${roomId}/poll`, { method: "POST", body: payload, token }),
  votePoll:            (messageId, optionIdx, token) => request(`/chat/polls/${messageId}/vote`, { method: "POST", body: { option_idx: optionIdx }, token }),

  // Lecturer special actions
  cancelClass:         (roomId, payload, token) => request(`/chat/rooms/${roomId}/cancel-class`, { method: "POST", body: payload, token }),
  generateSummary:     (roomId, token) => request(`/chat/rooms/${roomId}/ai-summary`, { method: "POST", token }),

  // Study invites
  createStudyInvite:   (roomId, payload, token) => request(`/chat/rooms/${roomId}/study-invite`, { method: "POST", body: payload, token }),
  rsvpStudyInvite:     (messageId, token) => request(`/chat/study-invite/${messageId}/rsvp`, { method: "POST", token }),
};

// ══════════════════════════════════════════════════════════
// WAVE 4 — Timetable, Calendar & Results
// ══════════════════════════════════════════════════════════

export const timetableApi = {
  // Class timetable
  uploadClassTimetable: (formData, token) =>
    request("/timetable/class/upload", { method: "POST", form: formData, token }),
  getMyClassTimetable: (token) =>
    request("/timetable/class/my", { token }),
  getAdminClassTimetable: (token, department, day) => {
    let path = "/timetable/class/admin";
    const params = [];
    if (department) params.push(`department=${encodeURIComponent(department)}`);
    if (day) params.push(`day=${encodeURIComponent(day)}`);
    if (params.length) path += `?${params.join("&")}`;
    return request(path, { token });
  },
  updateClassEntry: (entryId, payload, token) =>
    request(`/timetable/class/${entryId}`, { method: "PATCH", body: payload, token }),
  deleteClassEntry: (entryId, token) =>
    request(`/timetable/class/${entryId}`, { method: "DELETE", token }),

  // Exam timetable
  uploadExamTimetable: (formData, token) =>
    request("/timetable/exam/upload", { method: "POST", form: formData, token }),
  getMyExamTimetable: (token) =>
    request("/timetable/exam/my", { token }),

  // Calendar
  uploadCalendar: (formData, token) =>
    request("/timetable/calendar/upload", { method: "POST", form: formData, token }),
  getCalendarEvents: (token, semester) => {
    let path = "/timetable/calendar";
    if (semester) path += `?semester=${encodeURIComponent(semester)}`;
    return request(path, { token });
  },
  addCalendarEvent: (payload, token) =>
    request("/timetable/calendar/event", { method: "POST", body: payload, token }),
  deleteCalendarEvent: (eventId, token) =>
    request(`/timetable/calendar/${eventId}`, { method: "DELETE", token }),
  importPublicHolidays: (sessionId, token, year) => {
    const form = new FormData();
    form.append("session_id", sessionId);
    if (year) form.append("year", year);
    return request("/timetable/calendar/import-public-holidays", { method: "POST", form, token });
  },
};

export const resultsApi = {
  uploadResults: (formData, token) =>
    request("/results/upload", { method: "POST", form: formData, token }),
  getMyResults: (token) =>
    request("/results/my", { token }),
  getStudentResults: (studentId, token) =>
    request(`/results/student/${studentId}`, { token }),
  getResultsSummary: (token, sessionId, semester) => {
    let path = "/results/summary";
    const params = [];
    if (sessionId) params.push(`session_id=${sessionId}`);
    if (semester) params.push(`semester=${encodeURIComponent(semester)}`);
    if (params.length) path += `?${params.join("&")}`;
    return request(path, { token });
  },
  getResultAnalysis: (resultId, token) =>
    request(`/results/my/${resultId}/analysis`, { token }),
  createDispute: (resultId, disputeReason, token) =>
    request(`/results/my/${resultId}/disputes`, { method: "POST", body: { dispute_reason: disputeReason }, token }),
  getMyDisputes: (token) =>
    request("/results/my/disputes", { token }),
  getGraduationTracker: (token) =>
    request("/results/me/graduation-tracker", { token }),
};

export const sessionsApi = {
  getCurrentWeekInfo: (token) =>
    request("/sessions/current/week-info", { token }),
};

// ── Solidarity Wall ──────────────────────────────────────
export const solidarityApi = {
  getPosts: (courseId, token) =>
    request(`/solidarity/${courseId ? `?course_id=${courseId}` : ""}`, { token }),

  createPost: (content, courseId, token) =>
    request("/solidarity/", { method: "POST", body: { content, course_id: courseId || null }, token }),

  reactToPost: (postId, emoji, token) =>
    request(`/solidarity/${postId}/react`, { method: "POST", body: { emoji }, token }),
};

// ── Curated Resources ─────────────────────────────────────
export const curatedResourcesApi = {
  getResources: (token, courseId, topicTag) => {
    const params = [];
    if (courseId) params.push(`course_id=${courseId}`);
    if (topicTag) params.push(`topic_tag=${encodeURIComponent(topicTag)}`);
    const qs = params.length ? `?${params.join("&")}` : "";
    return request(`/resources/${qs}`, { token });
  },
  submitResource: (payload, token) =>
    request("/resources/", { method: "POST", body: payload, token }),
  upvoteResource: (id, token) =>
    request(`/resources/${id}/upvote`, { method: "POST", token }),
  approveResource: (id, is_approved, token) =>
    request(`/resources/${id}`, { method: "PATCH", body: { is_approved }, token }),
};

export default api;
