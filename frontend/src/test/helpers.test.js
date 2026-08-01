/**
 * Tests for utility functions in helpers.js
 */
import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import {
  initials,
  formatDate,
  formatTime,
  timeAgo,
  RISK_COLORS,
  RISK_HEX,
  getRiskColor,
  riskColors,
  notifColors,
  isDueSoon,
  progressColor,
  nameSimilarity,
  shapImpact,
} from "../utils/helpers";

// ── initials ───────────────────────────────────────────────

describe("initials", () => {
  it("extracts two initials from a full name", () => {
    expect(initials("John Doe")).toBe("JD");
  });

  it("handles single word", () => {
    expect(initials("John")).toBe("J");
  });

  it("handles three words (takes first two)", () => {
    expect(initials("John Michael Doe")).toBe("JM");
  });

  it("returns empty string for empty input", () => {
    expect(initials("")).toBe("");
  });

  it("defaults to empty string when called with no argument", () => {
    expect(initials()).toBe("");
  });
});

// ── formatDate ─────────────────────────────────────────────

describe("formatDate", () => {
  it("formats an ISO date string", () => {
    const result = formatDate("2024-06-15T10:00:00Z");
    expect(result).toContain("Jun");
    expect(result).toContain("2024");
  });

  it("returns em dash for falsy input", () => {
    expect(formatDate(null)).toBe("—");
    expect(formatDate("")).toBe("—");
    expect(formatDate(undefined)).toBe("—");
  });
});

// ── formatTime ─────────────────────────────────────────────

describe("formatTime", () => {
  it("formats a datetime to 12-hour time", () => {
    const result = formatTime("2024-06-15T14:30:00Z");
    expect(result).toBeTruthy();
    expect(result).not.toBe("—");
  });

  it("returns em dash for falsy input", () => {
    expect(formatTime(null)).toBe("—");
    expect(formatTime("")).toBe("—");
  });
});

// ── timeAgo ────────────────────────────────────────────────

describe("timeAgo", () => {
  beforeEach(() => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date("2024-06-15T12:00:00Z"));
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it('returns "just now" for very recent timestamps', () => {
    expect(timeAgo("2024-06-15T12:00:00Z")).toBe("just now");
  });

  it('returns "Xm ago" for minutes', () => {
    expect(timeAgo("2024-06-15T11:55:00Z")).toBe("5m ago");
  });

  it('returns "Xh ago" for hours', () => {
    expect(timeAgo("2024-06-15T09:00:00Z")).toBe("3h ago");
  });

  it('returns "Xd ago" for days', () => {
    expect(timeAgo("2024-06-14T12:00:00Z")).toBe("1d ago");
  });

  it("returns em dash for falsy input", () => {
    expect(timeAgo(null)).toBe("—");
    expect(timeAgo("")).toBe("—");
  });
});

// ── RISK_COLORS ────────────────────────────────────────────

describe("RISK_COLORS", () => {
  it("has high, medium, and low keys", () => {
    expect(RISK_COLORS).toHaveProperty("high");
    expect(RISK_COLORS).toHaveProperty("medium");
    expect(RISK_COLORS).toHaveProperty("low");
  });

  it("each level has bg, text, badge, and dot", () => {
    for (const level of ["high", "medium", "low"]) {
      expect(RISK_COLORS[level]).toHaveProperty("bg");
      expect(RISK_COLORS[level]).toHaveProperty("text");
      expect(RISK_COLORS[level]).toHaveProperty("badge");
      expect(RISK_COLORS[level]).toHaveProperty("dot");
    }
  });
});

// ── getRiskColor ───────────────────────────────────────────

describe("getRiskColor", () => {
  it("returns high colors for string 'high'", () => {
    expect(getRiskColor("high")).toBe(RISK_COLORS.high);
  });

  it("returns medium colors for string 'Medium' (case-insensitive)", () => {
    expect(getRiskColor("Medium")).toBe(RISK_COLORS.medium);
  });

  it("returns low colors for unknown string", () => {
    expect(getRiskColor("unknown")).toBe(RISK_COLORS.low);
  });

  it("returns high colors for score >= 70", () => {
    expect(getRiskColor(70)).toBe(RISK_COLORS.high);
    expect(getRiskColor(95)).toBe(RISK_COLORS.high);
  });

  it("returns medium colors for score 40-69", () => {
    expect(getRiskColor(40)).toBe(RISK_COLORS.medium);
    expect(getRiskColor(55)).toBe(RISK_COLORS.medium);
  });

  it("returns low colors for score < 40", () => {
    expect(getRiskColor(39)).toBe(RISK_COLORS.low);
    expect(getRiskColor(10)).toBe(RISK_COLORS.low);
  });
});

// ── riskColors ─────────────────────────────────────────────

describe("riskColors", () => {
  it("returns correct Tailwind classes for High", () => {
    const result = riskColors("High");
    expect(result.text).toBe("text-risk-high");
    expect(result.bar).toBe("#e11d48");
  });

  it("returns correct classes for Medium", () => {
    const result = riskColors("Medium");
    expect(result.text).toBe("text-amber-600");
  });

  it("returns correct classes for Low", () => {
    const result = riskColors("Low");
    expect(result.text).toBe("text-risk-low");
  });

  it("returns fallback for unknown level", () => {
    const result = riskColors("Unknown");
    expect(result.text).toBe("text-slate-500");
  });
});

// ── notifColors ────────────────────────────────────────────

describe("notifColors", () => {
  it("returns risk colors", () => {
    expect(notifColors("risk").icon).toBe("text-risk-high");
  });

  it("returns quiz colors", () => {
    expect(notifColors("quiz").icon).toBe("text-blue-500");
  });

  it("returns attendance colors", () => {
    expect(notifColors("attendance").icon).toBe("text-risk-low");
  });

  it("returns fallback for unknown type", () => {
    expect(notifColors("unknown").icon).toBe("text-slate-400");
  });
});

// ── isDueSoon ──────────────────────────────────────────────

describe("isDueSoon", () => {
  beforeEach(() => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date("2024-06-15T12:00:00Z"));
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it("returns true for due date within 48 hours", () => {
    expect(isDueSoon("2024-06-16T12:00:00Z")).toBe(true);
  });

  it("returns false for past due date", () => {
    expect(isDueSoon("2024-06-14T12:00:00Z")).toBe(false);
  });

  it("returns false for due date > 48 hours away", () => {
    expect(isDueSoon("2024-06-20T12:00:00Z")).toBe(false);
  });
});

// ── progressColor ──────────────────────────────────────────

describe("progressColor", () => {
  it("returns green for >= 70%", () => {
    expect(progressColor(70)).toBe("bg-risk-low");
    expect(progressColor(100)).toBe("bg-risk-low");
  });

  it("returns amber for 45-69%", () => {
    expect(progressColor(45)).toBe("bg-amber-400");
    expect(progressColor(69)).toBe("bg-amber-400");
  });

  it("returns red for < 45%", () => {
    expect(progressColor(44)).toBe("bg-risk-high");
    expect(progressColor(0)).toBe("bg-risk-high");
  });
});

// ── nameSimilarity ─────────────────────────────────────────

describe("nameSimilarity", () => {
  it("returns 1 for identical names", () => {
    expect(nameSimilarity("John Doe", "John Doe")).toBe(1);
  });

  it("is case-insensitive", () => {
    expect(nameSimilarity("john doe", "JOHN DOE")).toBe(1);
  });

  it("returns partial match", () => {
    const score = nameSimilarity("John Doe", "John Smith");
    expect(score).toBeGreaterThan(0);
    expect(score).toBeLessThan(1);
  });

  it("returns 0 for completely different names", () => {
    expect(nameSimilarity("Alice", "Bob")).toBe(0);
  });
});

// ── shapImpact ─────────────────────────────────────────────

describe("shapImpact", () => {
  it('returns "Strong" for abs >= 0.25', () => {
    expect(shapImpact(0.3)).toBe("Strong");
    expect(shapImpact(-0.25)).toBe("Strong");
  });

  it('returns "Moderate" for abs >= 0.12', () => {
    expect(shapImpact(0.15)).toBe("Moderate");
    expect(shapImpact(-0.12)).toBe("Moderate");
  });

  it('returns "Minor" for abs < 0.12', () => {
    expect(shapImpact(0.05)).toBe("Minor");
    expect(shapImpact(0)).toBe("Minor");
  });
});
