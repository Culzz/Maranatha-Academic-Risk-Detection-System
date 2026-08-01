/**
 * OnboardingModal — 3-step full-screen welcome flow.
 * Full viewport overlay with custom SVG illustrations in navy/gold theme.
 *
 * Props:
 *   userName               — first-name greeting on step 1
 *   role                   — "student" (default) or "lecturer"
 *   onOnboardingComplete   — called when user dismisses or clicks Get Started.
 */
import { useState } from "react";
import { firstName } from "../utils/greetings";
import { motion, AnimatePresence } from "framer-motion";
import { ChevronLeft, ChevronRight } from "lucide-react";

/* ─── SVG Illustrations ─────────────────────────────────────── */

function WelcomeIllustration() {
  return (
    <svg viewBox="0 0 320 260" fill="none" className="w-full max-w-xs mx-auto">
      {/* Dashboard frame */}
      <rect x="40" y="30" width="240" height="160" rx="16" fill="#0f1f3d" stroke="#1e3a5f" strokeWidth="1.5" />
      {/* Screen content area */}
      <rect x="52" y="50" width="216" height="128" rx="8" fill="#162d50" />
      {/* Top bar */}
      <rect x="52" y="50" width="216" height="20" rx="8" fill="#1e3a5f" />
      <circle cx="64" cy="60" r="3" fill="#ef4444" />
      <circle cx="74" cy="60" r="3" fill="#fbbf24" />
      <circle cx="84" cy="60" r="3" fill="#22c55e" />
      {/* Sidebar mock */}
      <rect x="52" y="70" width="44" height="108" fill="#0a162b" />
      <rect x="58" y="80" width="32" height="4" rx="2" fill="#1e3a5f" />
      <rect x="58" y="90" width="28" height="4" rx="2" fill="#1e3a5f" />
      <rect x="58" y="100" width="32" height="4" rx="2" fill="#b38b00" opacity="0.6" />
      <rect x="58" y="110" width="24" height="4" rx="2" fill="#1e3a5f" />
      <rect x="58" y="120" width="30" height="4" rx="2" fill="#1e3a5f" />
      {/* Main content: stat cards */}
      <rect x="104" y="78" width="48" height="36" rx="6" fill="#1e3a5f" />
      <rect x="158" y="78" width="48" height="36" rx="6" fill="#1e3a5f" />
      <rect x="212" y="78" width="48" height="36" rx="6" fill="#1e3a5f" />
      {/* Stat values */}
      <text x="128" y="100" textAnchor="middle" fill="#fbbf24" fontSize="14" fontWeight="700" fontFamily="serif">92</text>
      <text x="182" y="100" textAnchor="middle" fill="#22c55e" fontSize="14" fontWeight="700" fontFamily="serif">A+</text>
      <text x="236" y="100" textAnchor="middle" fill="white" fontSize="14" fontWeight="700" fontFamily="serif">4.1</text>
      {/* Chart area */}
      <rect x="104" y="122" width="156" height="50" rx="6" fill="#1e3a5f" />
      <polyline points="112,162 130,148 148,155 166,138 184,145 202,132 220,140 238,128 252,135" stroke="#fbbf24" strokeWidth="2" fill="none" strokeLinecap="round" strokeLinejoin="round" />
      <polyline points="112,162 130,158 148,160 166,152 184,156 202,148 220,150 238,144 252,146" stroke="#22c55e" strokeWidth="1.5" fill="none" strokeLinecap="round" strokeLinejoin="round" opacity="0.5" />
      {/* Graduation cap */}
      <g transform="translate(148, 8)">
        <polygon points="12,0 0,8 12,16 24,8" fill="#fbbf24" />
        <rect x="10" y="8" width="4" height="10" fill="#b38b00" />
        <line x1="24" y1="8" x2="24" y2="18" stroke="#fbbf24" strokeWidth="1.5" />
        <circle cx="24" cy="19" r="2" fill="#fbbf24" />
      </g>
      {/* Decorative glow */}
      <circle cx="160" cy="110" r="80" fill="url(#welcomeGlow)" opacity="0.08" />
      <defs>
        <radialGradient id="welcomeGlow">
          <stop offset="0%" stopColor="#fbbf24" />
          <stop offset="100%" stopColor="#fbbf24" stopOpacity="0" />
        </radialGradient>
      </defs>
      {/* Floating dots */}
      <circle cx="30" cy="60" r="2" fill="#fbbf24" opacity="0.3" />
      <circle cx="295" cy="45" r="3" fill="#fbbf24" opacity="0.2" />
      <circle cx="20" cy="170" r="2.5" fill="#fbbf24" opacity="0.15" />
      <circle cx="305" cy="175" r="2" fill="white" opacity="0.1" />
      {/* Bottom reflection */}
      <rect x="80" y="200" width="160" height="30" rx="10" fill="#0f1f3d" opacity="0.15" />
      <text x="160" y="220" textAnchor="middle" fill="#0f1f3d" fontSize="10" fontWeight="600" opacity="0.08">YOUR DASHBOARD</text>
    </svg>
  );
}

function RiskIllustration() {
  return (
    <svg viewBox="0 0 320 260" fill="none" className="w-full max-w-xs mx-auto">
      {/* Shield */}
      <path d="M160 20 L220 50 L220 130 C220 170 190 200 160 220 C130 200 100 170 100 130 L100 50 Z"
        fill="#0f1f3d" stroke="#1e3a5f" strokeWidth="1.5" />
      <path d="M160 35 L210 60 L210 128 C210 162 185 188 160 205 C135 188 110 162 110 128 L110 60 Z"
        fill="#162d50" />
      {/* Risk level bars inside shield */}
      <g transform="translate(125, 72)">
        {/* Low */}
        <rect x="0" y="0" width="70" height="18" rx="5" fill="#1e3a5f" />
        <rect x="2" y="2" width="46" height="14" rx="4" fill="#22c55e" opacity="0.8" />
        <text x="54" y="13" fill="white" fontSize="8" fontWeight="600">Low</text>
        {/* Medium */}
        <rect x="0" y="24" width="70" height="18" rx="5" fill="#1e3a5f" />
        <rect x="2" y="26" width="36" height="14" rx="4" fill="#f59e0b" opacity="0.8" />
        <text x="44" y="37" fill="white" fontSize="8" fontWeight="600">Med</text>
        {/* High */}
        <rect x="0" y="48" width="70" height="18" rx="5" fill="#1e3a5f" />
        <rect x="2" y="50" width="22" height="14" rx="4" fill="#ef4444" opacity="0.8" />
        <text x="30" y="61" fill="white" fontSize="8" fontWeight="600">High</text>
      </g>
      {/* Checkmark */}
      <circle cx="160" cy="170" r="16" fill="#fbbf24" />
      <polyline points="151,170 157,176 169,164" stroke="#0f1f3d" strokeWidth="2.5" fill="none" strokeLinecap="round" strokeLinejoin="round" />
      {/* Radiating lines */}
      <line x1="160" y1="148" x2="160" y2="140" stroke="#fbbf24" strokeWidth="1.5" opacity="0.4" />
      <line x1="175" y1="155" x2="181" y2="149" stroke="#fbbf24" strokeWidth="1.5" opacity="0.4" />
      <line x1="145" y1="155" x2="139" y2="149" stroke="#fbbf24" strokeWidth="1.5" opacity="0.4" />
      {/* Graph trend line */}
      <g transform="translate(60, 215)">
        <rect x="0" y="0" width="200" height="30" rx="8" fill="#0f1f3d" opacity="0.15" />
        <polyline points="15,22 45,14 75,18 105,8 135,12 165,6 185,10" stroke="#fbbf24" strokeWidth="1.5" fill="none" strokeLinecap="round" opacity="0.3" />
      </g>
      {/* Floating elements */}
      <circle cx="75" cy="40" r="3" fill="#22c55e" opacity="0.3" />
      <circle cx="245" cy="55" r="2.5" fill="#ef4444" opacity="0.3" />
      <circle cx="60" cy="200" r="2" fill="#fbbf24" opacity="0.2" />
      <circle cx="265" cy="190" r="3" fill="#fbbf24" opacity="0.15" />
    </svg>
  );
}

function SupportIllustration() {
  return (
    <svg viewBox="0 0 320 260" fill="none" className="w-full max-w-xs mx-auto">
      {/* Central person */}
      <circle cx="160" cy="90" r="24" fill="#0f1f3d" stroke="#1e3a5f" strokeWidth="1.5" />
      <circle cx="160" cy="82" r="10" fill="#fbbf24" />
      <path d="M148 98 Q160 108 172 98" stroke="#fbbf24" strokeWidth="2" fill="none" strokeLinecap="round" />
      {/* Left person */}
      <circle cx="80" cy="130" r="18" fill="#0f1f3d" stroke="#1e3a5f" strokeWidth="1.5" />
      <circle cx="80" cy="124" r="7" fill="#cbd5e1" />
      <path d="M72 136 Q80 143 88 136" stroke="#cbd5e1" strokeWidth="1.5" fill="none" strokeLinecap="round" />
      {/* Right person */}
      <circle cx="240" cy="130" r="18" fill="#0f1f3d" stroke="#1e3a5f" strokeWidth="1.5" />
      <circle cx="240" cy="124" r="7" fill="#cbd5e1" />
      <path d="M232 136 Q240 143 248 136" stroke="#cbd5e1" strokeWidth="1.5" fill="none" strokeLinecap="round" />
      {/* Connection lines */}
      <line x1="140" y1="100" x2="96" y2="118" stroke="#fbbf24" strokeWidth="1.5" strokeDasharray="4 3" opacity="0.5" />
      <line x1="180" y1="100" x2="224" y2="118" stroke="#fbbf24" strokeWidth="1.5" strokeDasharray="4 3" opacity="0.5" />
      <line x1="98" y1="135" x2="222" y2="135" stroke="#1e3a5f" strokeWidth="1" strokeDasharray="4 3" opacity="0.3" />
      {/* Speech bubbles */}
      <g transform="translate(105, 40)">
        <rect x="0" y="0" width="50" height="24" rx="8" fill="#1e3a5f" />
        <polygon points="18,24 22,32 26,24" fill="#1e3a5f" />
        <rect x="8" y="7" width="20" height="3" rx="1.5" fill="#fbbf24" opacity="0.6" />
        <rect x="8" y="13" width="14" height="3" rx="1.5" fill="#fbbf24" opacity="0.4" />
      </g>
      <g transform="translate(175, 50)">
        <rect x="0" y="0" width="44" height="20" rx="8" fill="#1e3a5f" />
        <polygon points="14,20 18,27 22,20" fill="#1e3a5f" />
        <rect x="7" y="6" width="16" height="3" rx="1.5" fill="white" opacity="0.3" />
        <rect x="7" y="11" width="10" height="3" rx="1.5" fill="white" opacity="0.2" />
      </g>
      {/* Bottom: network nodes */}
      <g transform="translate(80, 175)">
        {[0, 40, 80, 120].map((x, i) => (
          <g key={i}>
            <circle cx={x + 20} cy="15" r="10" fill="#0f1f3d" stroke="#1e3a5f" strokeWidth="1" />
            <circle cx={x + 20} cy="13" r="4" fill={i === 1 ? "#fbbf24" : "#64748b"} />
            {i < 3 && <line x1={x + 30} y1="15" x2={x + 50} y2="15" stroke="#1e3a5f" strokeWidth="1" strokeDasharray="3 2" />}
          </g>
        ))}
      </g>
      {/* Bell notification */}
      <g transform="translate(258, 80)">
        <circle cx="12" cy="12" r="14" fill="#1e3a5f" />
        <path d="M7 14 L7 9 C7 6 9 4 12 4 C15 4 17 6 17 9 L17 14 L7 14Z" fill="#fbbf24" />
        <rect x="6" y="14" width="12" height="2" rx="1" fill="#fbbf24" />
        <circle cx="12" cy="18" r="1.5" fill="#fbbf24" />
        <circle cx="19" cy="5" r="4" fill="#ef4444" />
        <text x="19" y="7.5" textAnchor="middle" fill="white" fontSize="5" fontWeight="700">3</text>
      </g>
      {/* Decorative */}
      <circle cx="40" cy="70" r="2" fill="#fbbf24" opacity="0.2" />
      <circle cx="290" cy="50" r="2.5" fill="#fbbf24" opacity="0.15" />
      <circle cx="50" cy="220" r="3" fill="#fbbf24" opacity="0.1" />
      <circle cx="275" cy="210" r="2" fill="white" opacity="0.08" />
    </svg>
  );
}

/* ─── Lecturer SVG Illustrations ──────────────────────────────── */

function LecturerWelcomeIllustration() {
  return (
    <svg viewBox="0 0 320 260" fill="none" className="w-full max-w-xs mx-auto">
      {/* Dashboard frame */}
      <rect x="40" y="25" width="240" height="170" rx="16" fill="#0f1f3d" stroke="#1e3a5f" strokeWidth="1.5" />
      {/* Screen content area */}
      <rect x="52" y="45" width="216" height="138" rx="8" fill="#162d50" />
      {/* Top bar */}
      <rect x="52" y="45" width="216" height="20" rx="8" fill="#1e3a5f" />
      <circle cx="64" cy="55" r="3" fill="#ef4444" />
      <circle cx="74" cy="55" r="3" fill="#fbbf24" />
      <circle cx="84" cy="55" r="3" fill="#22c55e" />
      {/* Course card 1 */}
      <rect x="60" y="72" width="96" height="48" rx="6" fill="#1e3a5f" />
      <rect x="68" y="80" width="50" height="4" rx="2" fill="#fbbf24" opacity="0.8" />
      <rect x="68" y="88" width="36" height="3" rx="1.5" fill="white" opacity="0.3" />
      <rect x="68" y="95" width="72" height="3" rx="1.5" fill="white" opacity="0.2" />
      <text x="68" y="112" fill="#22c55e" fontSize="9" fontWeight="700" fontFamily="sans-serif">32 students</text>
      {/* Course card 2 */}
      <rect x="164" y="72" width="96" height="48" rx="6" fill="#1e3a5f" />
      <rect x="172" y="80" width="50" height="4" rx="2" fill="#fbbf24" opacity="0.8" />
      <rect x="172" y="88" width="36" height="3" rx="1.5" fill="white" opacity="0.3" />
      <rect x="172" y="95" width="72" height="3" rx="1.5" fill="white" opacity="0.2" />
      <text x="172" y="112" fill="#22c55e" fontSize="9" fontWeight="700" fontFamily="sans-serif">28 students</text>
      {/* Chart area */}
      <rect x="60" y="128" width="200" height="48" rx="6" fill="#1e3a5f" />
      {/* Bar chart */}
      <rect x="76"  y="158" width="14" height="12" rx="2" fill="#22c55e" opacity="0.7" />
      <rect x="96"  y="150" width="14" height="20" rx="2" fill="#22c55e" opacity="0.8" />
      <rect x="116" y="145" width="14" height="25" rx="2" fill="#fbbf24" opacity="0.8" />
      <rect x="136" y="152" width="14" height="18" rx="2" fill="#fbbf24" opacity="0.7" />
      <rect x="156" y="160" width="14" height="10" rx="2" fill="#ef4444" opacity="0.6" />
      <rect x="176" y="148" width="14" height="22" rx="2" fill="#22c55e" opacity="0.8" />
      <rect x="196" y="142" width="14" height="28" rx="2" fill="#22c55e" opacity="0.9" />
      <rect x="216" y="155" width="14" height="15" rx="2" fill="#fbbf24" opacity="0.7" />
      {/* Lectern / podium icon */}
      <g transform="translate(142, 4)">
        <rect x="8" y="0" width="20" height="3" rx="1.5" fill="#fbbf24" />
        <rect x="14" y="3" width="8" height="14" rx="2" fill="#b38b00" />
        <rect x="6" y="17" width="24" height="3" rx="1.5" fill="#fbbf24" />
      </g>
      {/* Decorative glow */}
      <circle cx="160" cy="120" r="80" fill="url(#lecWelcomeGlow)" opacity="0.08" />
      <defs>
        <radialGradient id="lecWelcomeGlow">
          <stop offset="0%" stopColor="#fbbf24" />
          <stop offset="100%" stopColor="#fbbf24" stopOpacity="0" />
        </radialGradient>
      </defs>
      {/* Floating dots */}
      <circle cx="30" cy="55" r="2" fill="#fbbf24" opacity="0.3" />
      <circle cx="295" cy="40" r="3" fill="#fbbf24" opacity="0.2" />
      <circle cx="20" cy="175" r="2.5" fill="#fbbf24" opacity="0.15" />
      <circle cx="305" cy="180" r="2" fill="white" opacity="0.1" />
      {/* Bottom reflection */}
      <rect x="80" y="206" width="160" height="30" rx="10" fill="#0f1f3d" opacity="0.15" />
      <text x="160" y="225" textAnchor="middle" fill="#0f1f3d" fontSize="10" fontWeight="600" opacity="0.08">TEACHING DASHBOARD</text>
    </svg>
  );
}

function LecturerRiskIllustration() {
  return (
    <svg viewBox="0 0 320 260" fill="none" className="w-full max-w-xs mx-auto">
      {/* Shield */}
      <path d="M160 20 L220 50 L220 130 C220 170 190 200 160 220 C130 200 100 170 100 130 L100 50 Z"
        fill="#0f1f3d" stroke="#1e3a5f" strokeWidth="1.5" />
      <path d="M160 35 L210 60 L210 128 C210 162 185 188 160 205 C135 188 110 162 110 128 L110 60 Z"
        fill="#162d50" />
      {/* Risk level bars inside shield */}
      <g transform="translate(125, 68)">
        {/* Low risk students */}
        <rect x="0" y="0" width="70" height="18" rx="5" fill="#1e3a5f" />
        <rect x="2" y="2" width="50" height="14" rx="4" fill="#22c55e" opacity="0.8" />
        <text x="56" y="13" fill="white" fontSize="7" fontWeight="600">18</text>
        {/* Medium risk students */}
        <rect x="0" y="24" width="70" height="18" rx="5" fill="#1e3a5f" />
        <rect x="2" y="26" width="30" height="14" rx="4" fill="#f59e0b" opacity="0.8" />
        <text x="36" y="37" fill="white" fontSize="7" fontWeight="600">8</text>
        {/* High risk students */}
        <rect x="0" y="48" width="70" height="18" rx="5" fill="#1e3a5f" />
        <rect x="2" y="50" width="16" height="14" rx="4" fill="#ef4444" opacity="0.8" />
        <text x="22" y="61" fill="white" fontSize="7" fontWeight="600">3</text>
      </g>
      {/* SHAP label */}
      <g transform="translate(130, 145)">
        <rect x="0" y="0" width="60" height="18" rx="6" fill="#fbbf24" opacity="0.2" />
        <text x="30" y="13" textAnchor="middle" fill="#fbbf24" fontSize="8" fontWeight="700">SHAP</text>
      </g>
      {/* Eye / monitor icon */}
      <g transform="translate(143, 168)">
        <ellipse cx="17" cy="10" rx="17" ry="10" fill="none" stroke="#fbbf24" strokeWidth="1.5" />
        <circle cx="17" cy="10" r="5" fill="#fbbf24" />
        <circle cx="17" cy="10" r="2" fill="#0f1f3d" />
      </g>
      {/* Radiating lines from eye */}
      <line x1="160" y1="163" x2="160" y2="155" stroke="#fbbf24" strokeWidth="1.5" opacity="0.4" />
      <line x1="175" y1="166" x2="182" y2="160" stroke="#fbbf24" strokeWidth="1.5" opacity="0.4" />
      <line x1="145" y1="166" x2="138" y2="160" stroke="#fbbf24" strokeWidth="1.5" opacity="0.4" />
      {/* Bottom trend */}
      <g transform="translate(60, 215)">
        <rect x="0" y="0" width="200" height="30" rx="8" fill="#0f1f3d" opacity="0.15" />
        <polyline points="15,22 45,14 75,18 105,8 135,12 165,6 185,10" stroke="#fbbf24" strokeWidth="1.5" fill="none" strokeLinecap="round" opacity="0.3" />
      </g>
      {/* Floating elements */}
      <circle cx="75" cy="40" r="3" fill="#22c55e" opacity="0.3" />
      <circle cx="245" cy="55" r="2.5" fill="#ef4444" opacity="0.3" />
      <circle cx="60" cy="200" r="2" fill="#fbbf24" opacity="0.2" />
      <circle cx="265" cy="190" r="3" fill="#fbbf24" opacity="0.15" />
    </svg>
  );
}

function LecturerToolkitIllustration() {
  return (
    <svg viewBox="0 0 320 260" fill="none" className="w-full max-w-xs mx-auto">
      {/* Background circle */}
      <circle cx="160" cy="120" r="90" fill="#0f1f3d" opacity="0.08" />

      {/* QR Code icon (top-left) */}
      <g transform="translate(70, 50)">
        <rect x="0" y="0" width="52" height="52" rx="12" fill="#0f1f3d" stroke="#1e3a5f" strokeWidth="1.5" />
        {/* QR pattern */}
        <rect x="10" y="10" width="12" height="12" rx="2" fill="#fbbf24" />
        <rect x="30" y="10" width="12" height="12" rx="2" fill="#fbbf24" />
        <rect x="10" y="30" width="12" height="12" rx="2" fill="#fbbf24" />
        <rect x="30" y="30" width="4" height="4" fill="#fbbf24" opacity="0.6" />
        <rect x="36" y="30" width="4" height="4" fill="#fbbf24" opacity="0.4" />
        <rect x="30" y="36" width="4" height="4" fill="#fbbf24" opacity="0.4" />
        <rect x="36" y="36" width="4" height="4" fill="#fbbf24" opacity="0.6" />
        <text x="26" y="60" textAnchor="middle" fill="#b38b00" fontSize="7" fontWeight="600">QR</text>
      </g>

      {/* Quiz icon (top-right) */}
      <g transform="translate(198, 50)">
        <rect x="0" y="0" width="52" height="52" rx="12" fill="#0f1f3d" stroke="#1e3a5f" strokeWidth="1.5" />
        {/* Document with checkmarks */}
        <rect x="12" y="8" width="28" height="36" rx="4" fill="#162d50" />
        <rect x="18" y="14" width="16" height="3" rx="1.5" fill="white" opacity="0.3" />
        <rect x="18" y="21" width="12" height="3" rx="1.5" fill="white" opacity="0.3" />
        <rect x="18" y="28" width="14" height="3" rx="1.5" fill="white" opacity="0.3" />
        <circle cx="34" cy="15.5" r="3" fill="#22c55e" opacity="0.8" />
        <circle cx="34" cy="22.5" r="3" fill="#22c55e" opacity="0.8" />
        <circle cx="34" cy="29.5" r="3" fill="#fbbf24" opacity="0.8" />
        <text x="26" y="60" textAnchor="middle" fill="#b38b00" fontSize="7" fontWeight="600">QUIZ</text>
      </g>

      {/* Message bubble icon (bottom-left) */}
      <g transform="translate(70, 140)">
        <rect x="0" y="0" width="52" height="52" rx="12" fill="#0f1f3d" stroke="#1e3a5f" strokeWidth="1.5" />
        {/* Chat bubble */}
        <path d="M12 12 L40 12 C42 12 42 14 42 14 L42 30 C42 32 40 32 40 32 L22 32 L16 38 L16 32 L12 32 C10 32 10 30 10 30 L10 14 C10 12 12 12 12 12Z"
          fill="#162d50" stroke="#fbbf24" strokeWidth="1" />
        <rect x="16" y="18" width="18" height="3" rx="1.5" fill="#fbbf24" opacity="0.6" />
        <rect x="16" y="24" width="12" height="3" rx="1.5" fill="#fbbf24" opacity="0.4" />
        <text x="26" y="60" textAnchor="middle" fill="#b38b00" fontSize="7" fontWeight="600">CHAT</text>
      </g>

      {/* Calendar icon (bottom-right) */}
      <g transform="translate(198, 140)">
        <rect x="0" y="0" width="52" height="52" rx="12" fill="#0f1f3d" stroke="#1e3a5f" strokeWidth="1.5" />
        {/* Calendar */}
        <rect x="10" y="14" width="32" height="28" rx="4" fill="#162d50" />
        <rect x="10" y="14" width="32" height="10" rx="4" fill="#fbbf24" opacity="0.3" />
        <rect x="14" y="10" width="3" height="8" rx="1.5" fill="#fbbf24" />
        <rect x="35" y="10" width="3" height="8" rx="1.5" fill="#fbbf24" />
        {/* Calendar dots */}
        <circle cx="19" cy="32" r="2" fill="white" opacity="0.3" />
        <circle cx="26" cy="32" r="2" fill="#fbbf24" opacity="0.6" />
        <circle cx="33" cy="32" r="2" fill="white" opacity="0.3" />
        <circle cx="19" cy="38" r="2" fill="white" opacity="0.2" />
        <circle cx="26" cy="38" r="2" fill="white" opacity="0.2" />
        <circle cx="33" cy="38" r="2" fill="#ef4444" opacity="0.5" />
        <text x="26" y="60" textAnchor="middle" fill="#b38b00" fontSize="7" fontWeight="600">HOURS</text>
      </g>

      {/* Center connecting cross lines */}
      <line x1="130" y1="96" x2="155" y2="120" stroke="#fbbf24" strokeWidth="1" strokeDasharray="4 3" opacity="0.3" />
      <line x1="190" y1="96" x2="165" y2="120" stroke="#fbbf24" strokeWidth="1" strokeDasharray="4 3" opacity="0.3" />
      <line x1="130" y1="146" x2="155" y2="125" stroke="#fbbf24" strokeWidth="1" strokeDasharray="4 3" opacity="0.3" />
      <line x1="190" y1="146" x2="165" y2="125" stroke="#fbbf24" strokeWidth="1" strokeDasharray="4 3" opacity="0.3" />
      {/* Center dot */}
      <circle cx="160" cy="122" r="6" fill="#fbbf24" opacity="0.2" />
      <circle cx="160" cy="122" r="3" fill="#fbbf24" opacity="0.5" />

      {/* Bottom label */}
      <g transform="translate(80, 215)">
        <rect x="0" y="0" width="160" height="30" rx="10" fill="#0f1f3d" opacity="0.15" />
        <text x="80" y="19" textAnchor="middle" fill="#0f1f3d" fontSize="10" fontWeight="600" opacity="0.08">YOUR TOOLKIT</text>
      </g>

      {/* Floating decorative dots */}
      <circle cx="45" cy="40" r="2" fill="#fbbf24" opacity="0.2" />
      <circle cx="280" cy="35" r="2.5" fill="#fbbf24" opacity="0.15" />
      <circle cx="40" cy="220" r="3" fill="#fbbf24" opacity="0.1" />
      <circle cx="285" cy="215" r="2" fill="white" opacity="0.08" />
    </svg>
  );
}

/* ─── Steps ──────────────────────────────────────────────────── */

const STUDENT_STEPS = [
  {
    Illustration: WelcomeIllustration,
    pill:     "Welcome",
    title:    "Your Academic Portal",
    subtitle: "Everything you need in one place.",
    body:     "This is your personal dashboard for tracking academic progress at Maranatha University. Attendance, quizzes, assignments, risk insights, and AI-powered support -- all unified.",
  },
  {
    Illustration: RiskIllustration,
    pill:     "Risk Levels",
    title:    "Understanding Your Risk",
    subtitle: "Support, not punishment.",
    body:     "Your risk level -- Low, Medium, or High -- is an early signal designed to help you get support before small issues grow. The system tracks attendance, grades, engagement, and more.",
    highlight: "High Risk means you're being supported, not judged.",
  },
  {
    Illustration: SupportIllustration,
    pill:     "Support",
    title:    "You're Never Alone",
    subtitle: "Help is always one click away.",
    body:     "Use the Course Tutor anytime you have questions. Your lecturers send personalised guidance. The bell icon shows notifications. And the SOS button gets you immediate help.",
  },
];

const LECTURER_STEPS = [
  {
    Illustration: LecturerWelcomeIllustration,
    pill:     "Welcome",
    title:    "Welcome to Your Teaching Dashboard",
    subtitle: "Everything in one place.",
    body:     "Monitor your students\u2019 academic progress, manage courses, and deliver targeted interventions \u2014 all from one place.",
  },
  {
    Illustration: LecturerRiskIllustration,
    pill:     "Risk Detection",
    title:    "Understanding Student Risk",
    subtitle: "Early signals, better outcomes.",
    body:     "The system automatically identifies at-risk students in your courses. View risk levels, SHAP explanations, and send personalised interventions.",
    highlight: "Intervene early \u2014 before small struggles become failures.",
  },
  {
    Illustration: LecturerToolkitIllustration,
    pill:     "Toolkit",
    title:    "Your Toolkit",
    subtitle: "Powerful tools at your fingertips.",
    body:     "Take QR attendance, create quizzes, manage assignments, set office hours, broadcast tasks, and chat with students.",
  },
];

const slideVariants = {
  enter:  (dir) => ({ opacity: 0, x: dir > 0 ? 80 : -80 }),
  center: { opacity: 1, x: 0 },
  exit:   (dir) => ({ opacity: 0, x: dir > 0 ? -80 : 80 }),
};

/* ─── Component ──────────────────────────────────────────────── */

export default function OnboardingModal({ userId, userName, role = "student", onOnboardingComplete }) {
  const flagKey = `onboarding_seen_${userId || "guest"}`;
  const [visible, setVisible] = useState(false);
  const [step, setStep] = useState(0);
  const [dir,  setDir]  = useState(1);

  const STEPS = role === "lecturer" ? LECTURER_STEPS : STUDENT_STEPS;

  useState(() => {
    try {
      if (!localStorage.getItem(flagKey)) setVisible(true);
    } catch {}
  });

  const dismiss = () => {
    try { localStorage.setItem(flagKey, "1"); } catch {}
    setVisible(false);
    onOnboardingComplete?.();
  };

  if (!visible) return null;

  const go = (next) => {
    setDir(next > step ? 1 : -1);
    setStep(next);
  };

  const current = STEPS[step];
  const isLast  = step === STEPS.length - 1;

  return (
    <AnimatePresence>
      <motion.div
        key="onboarding-fullscreen"
        initial={{ opacity: 0 }}
        animate={{ opacity: 1 }}
        exit={{ opacity: 0 }}
        className="fixed inset-0 z-[60] bg-white flex flex-col"
      >
        {/* Main content area */}
        <div className="flex-1 flex flex-col items-center justify-center px-6 py-8 overflow-y-auto">
          <AnimatePresence mode="wait" custom={dir}>
            <motion.div
              key={step}
              custom={dir}
              variants={slideVariants}
              initial="enter"
              animate="center"
              exit="exit"
              transition={{ duration: 0.35, ease: [0.16, 1, 0.3, 1] }}
              className="flex flex-col items-center text-center max-w-lg w-full"
            >
              {/* Illustration */}
              <div className="mb-8 w-full">
                <current.Illustration />
              </div>

              {/* Section pill */}
              <span className="section-pill section-pill--gold mb-4">
                {current.pill}
              </span>

              {/* Greeting (step 1 only) */}
              {step === 0 && userName && (
                <p className="text-sm font-semibold text-accent mb-2">
                  Welcome, {firstName(userName)}
                </p>
              )}

              {/* Title */}
              <h1 className="headline-mixed text-3xl sm:text-4xl mb-2">
                {current.title}
              </h1>
              <p className="text-lg text-slate-400 font-medium mb-4" style={{ fontFamily: '"Source Serif 4", Georgia, serif', fontStyle: 'italic' }}>
                {current.subtitle}
              </p>

              {/* Body */}
              <p className="text-slate-500 text-sm sm:text-base leading-relaxed max-w-md">
                {current.body}
              </p>

              {/* Highlight callout */}
              {current.highlight && (
                <div className="mt-5 bg-amber-50 border border-amber-200 rounded-2xl px-5 py-3.5 max-w-sm">
                  <p className="text-amber-800 text-sm font-semibold">{current.highlight}</p>
                </div>
              )}
            </motion.div>
          </AnimatePresence>
        </div>

        {/* Footer navigation */}
        <div className="flex-shrink-0 border-t border-slate-100 px-6 py-5">
          <div className="max-w-lg mx-auto flex items-center justify-between">
            {/* Progress dots */}
            <div className="flex items-center gap-2">
              {STEPS.map((_, i) => (
                <button
                  key={i}
                  onClick={() => go(i)}
                  className={`transition-all duration-300 rounded-full ${
                    i === step
                      ? "w-8 h-2.5 bg-primary"
                      : i < step
                      ? "w-2.5 h-2.5 bg-accent/40"
                      : "w-2.5 h-2.5 bg-slate-200 hover:bg-slate-300"
                  }`}
                />
              ))}
            </div>

            {/* Navigation buttons */}
            <div className="flex items-center gap-3">
              {step > 0 && (
                <button
                  onClick={() => go(step - 1)}
                  className="flex items-center gap-1.5 text-slate-500 hover:text-primary text-sm font-medium transition-colors px-4 h-10 rounded-xl hover:bg-slate-50"
                >
                  <ChevronLeft size={15} /> Back
                </button>
              )}
              {step === 0 && (
                <button
                  onClick={dismiss}
                  className="text-slate-400 hover:text-slate-600 text-sm font-medium transition-colors px-4 h-10 rounded-xl hover:bg-slate-50"
                >
                  Skip
                </button>
              )}
              <motion.button
                whileTap={{ scale: 0.97 }}
                onClick={isLast ? dismiss : () => go(step + 1)}
                className="flex items-center gap-2 bg-primary hover:bg-primary-light text-white text-sm font-semibold px-6 h-10 rounded-xl transition-all shadow-premium-sm"
              >
                {isLast ? "Get Started" : "Next"}
                {!isLast && <ChevronRight size={15} />}
              </motion.button>
            </div>
          </div>
        </div>
      </motion.div>
    </AnimatePresence>
  );
}
