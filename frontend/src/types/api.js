/**
 * @file API Type Definitions (JSDoc)
 *
 * Provides type safety for API response shapes without requiring
 * a full TypeScript migration. Import types in any .js file:
 *
 *   /** @type {import('../types/api').User} *​/
 *   const user = await studentsApi.getProfile(token);
 */

// ══════════════════════════════════════════════════════════════
// Auth
// ══════════════════════════════════════════════════════════════

/**
 * @typedef {Object} TokenResponse
 * @property {string} access_token
 * @property {string} refresh_token
 * @property {string} role - "student" | "lecturer" | "admin"
 * @property {string} user_id
 * @property {string} full_name
 * @property {string} identifier - matric_number, staff_id, or email
 */

// ══════════════════════════════════════════════════════════════
// User
// ══════════════════════════════════════════════════════════════

/**
 * @typedef {Object} User
 * @property {string} id
 * @property {string} email
 * @property {string} full_name
 * @property {string} role - "student" | "lecturer" | "admin"
 * @property {string} [matric_number]
 * @property {string} [staff_id]
 * @property {number} [department_id]
 * @property {number} [level]
 * @property {boolean} is_active
 * @property {string} [created_at]
 * @property {string} [last_login]
 * @property {string} [profile_picture]
 */

// ══════════════════════════════════════════════════════════════
// Courses & Enrollment
// ══════════════════════════════════════════════════════════════

/**
 * @typedef {Object} Course
 * @property {number} course_id
 * @property {string} course_code
 * @property {string} course_title
 * @property {number} credit_units
 * @property {number} level
 * @property {number} [enrolled_count]
 */

/**
 * @typedef {Object} Enrollment
 * @property {string} student_name
 * @property {string} matric_number
 * @property {string} course_code
 * @property {string} [course_title]
 * @property {string} [enrolled_at]
 */

// ══════════════════════════════════════════════════════════════
// Risk
// ══════════════════════════════════════════════════════════════

/**
 * @typedef {Object} RiskScore
 * @property {string} course_code
 * @property {string} course_title
 * @property {number} week_number
 * @property {"High"|"Medium"|"Low"} risk_level
 * @property {number} risk_probability - 0.0 to 1.0
 * @property {"High"|"Medium"|"Low"|null} previous_risk_level
 * @property {Object} [shap_explanation]
 * @property {string} computed_at
 */

/**
 * @typedef {Object} StudentRisk
 * @property {string} student_id
 * @property {string} full_name
 * @property {string} matric_number
 * @property {"High"|"Medium"|"Low"|null} risk_level
 * @property {number|null} risk_probability
 * @property {"High"|"Medium"|"Low"|null} previous_risk_level
 * @property {number|null} week_number
 * @property {Object|null} shap_explanation
 * @property {string|null} latest_reflection
 * @property {number|null} attendance_rate
 * @property {number|null} quiz_average
 * @property {number|null} assignment_score
 */

// ══════════════════════════════════════════════════════════════
// Engagement
// ══════════════════════════════════════════════════════════════

/**
 * @typedef {Object} EngagementMetric
 * @property {string} course_code
 * @property {number} week_number
 * @property {number|null} attendance_rate
 * @property {number|null} quiz_average_score
 * @property {number|null} submission_rate
 * @property {number|null} login_count
 * @property {number|null} engagement_score
 */

// ══════════════════════════════════════════════════════════════
// Interventions
// ══════════════════════════════════════════════════════════════

/**
 * @typedef {Object} Intervention
 * @property {number} id
 * @property {string} course_code
 * @property {string} intervention_title
 * @property {string} trigger_condition
 * @property {string} recommended_at
 * @property {"pending"|"viewed"|"completed"} status
 * @property {string|null} ai_content
 */

// ══════════════════════════════════════════════════════════════
// Assignments & Quizzes
// ══════════════════════════════════════════════════════════════

/**
 * @typedef {Object} Assignment
 * @property {number} id
 * @property {string} course_code
 * @property {string} title
 * @property {string|null} due_date
 * @property {string|null} description
 * @property {number} max_marks
 * @property {boolean} allows_file
 * @property {boolean} allows_text
 * @property {boolean} submitted
 * @property {number|null} submission_id
 * @property {number|null} score
 * @property {string|null} feedback
 * @property {string|null} submitted_at
 */

/**
 * @typedef {Object} Quiz
 * @property {number} id
 * @property {string} course_code
 * @property {string} title
 * @property {number} total_marks
 * @property {string|null} due_date
 * @property {number|null} time_limit_mins
 * @property {"completed"|"pending"} status
 * @property {number|null} score
 * @property {string|null} attempted_at
 */

// ══════════════════════════════════════════════════════════════
// Admin
// ══════════════════════════════════════════════════════════════

/**
 * @typedef {Object} AdminDashboard
 * @property {number} total_students
 * @property {number} total_lecturers
 * @property {string|null} active_session
 * @property {{High: number, Medium: number, Low: number}} risk_distribution
 */

/**
 * @typedef {Object} AuditLogEntry
 * @property {number} id
 * @property {string} user_name
 * @property {string} action
 * @property {string} resource_type
 * @property {string} created_at
 * @property {Object|null} details
 */

/**
 * @typedef {Object} SystemSetting
 * @property {number} id
 * @property {string} key
 * @property {string} value
 * @property {string} [description]
 */

// ══════════════════════════════════════════════════════════════
// API Envelope
// ══════════════════════════════════════════════════════════════

/**
 * @template T
 * @typedef {Object} ApiResponse
 * @property {boolean} success
 * @property {T|null} data
 * @property {string|null} message
 * @property {string|null} error
 */

/**
 * @template T
 * @typedef {Object} PaginatedResponse
 * @property {boolean} success
 * @property {T[]} data
 * @property {string|null} message
 * @property {string|null} error
 * @property {{total: number, skip: number, limit: number, has_more: boolean}} pagination
 */

export {};
