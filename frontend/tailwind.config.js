/** @type {import('tailwindcss').Config} */
export default {
  darkMode: 'class',
  content: ["./index.html", "./src/**/*.{js,ts,jsx,tsx}"],
  theme: {
    extend: {
      colors: {
        primary: { DEFAULT: "#0f1f3d", light: "#1e3058", dark: "#080f1d" },
        accent:  { DEFAULT: "#b38b00", light: "#c9a000", dark: "#8a6b00" },
        risk:    { high: "#e11d48", medium: "#f59e0b", low: "#10b981" },
        surface: { bg: "#f8fafc", card: "#ffffff", border: "#e2e8f0" },
        navy: {
          50: '#f0f3ff', 100: '#e0e7ff', 200: '#c7d2fe', 300: '#a5b4fc',
          400: '#818cf8', 500: '#1e3a5f', 600: '#172e4d', 700: '#0f1f33',
          800: '#0a1628', 900: '#050d1a',
        },
        gold: {
          50: '#fffbeb', 100: '#fef3c7', 200: '#fde68a', 300: '#fcd34d',
          400: '#fbbf24', 500: '#d4a017', 600: '#b8860b',
        },
      },
      fontFamily: {
        sans:  ["Inter", "system-ui", "sans-serif"],
        serif: ['"Source Serif 4"', "Georgia", "serif"],
      },
      fontSize: {
        /* 8-pt aligned type scale */
        "2xs": ["11px", { lineHeight: "16px", letterSpacing: "0.02em"  }],
        "xs":  ["12px", { lineHeight: "16px", letterSpacing: "0.01em"  }],
        "sm":  ["13px", { lineHeight: "20px", letterSpacing: "-0.006em"}],
        "base":["15px", { lineHeight: "24px", letterSpacing: "-0.011em"}],
        "lg":  ["17px", { lineHeight: "26px", letterSpacing: "-0.014em"}],
        "xl":  ["20px", { lineHeight: "28px", letterSpacing: "-0.018em"}],
        "2xl": ["24px", { lineHeight: "32px", letterSpacing: "-0.022em"}],
        "3xl": ["28px", { lineHeight: "36px", letterSpacing: "-0.028em"}],
        "4xl": ["36px", { lineHeight: "40px", letterSpacing: "-0.032em"}],
      },
      spacing: {
        /* 8pt grid — names match px multiples of 4 */
        "1":  "4px",
        "2":  "8px",
        "3":  "12px",
        "4":  "16px",
        "5":  "20px",
        "6":  "24px",
        "7":  "28px",
        "8":  "32px",
        "9":  "36px",
        "10": "40px",
        "12": "48px",
        "14": "56px",
        "16": "64px",
      },
      borderRadius: {
        "sm":  "6px",
        "md":  "8px",
        "lg":  "10px",
        "xl":  "12px",
        "2xl": "16px",
        "3xl": "20px",
        "full":"9999px",
      },
      boxShadow: {
        sm:       "0 1px 2px rgba(15,31,61,0.06)",
        DEFAULT:  "0 1px 3px rgba(15,31,61,0.06), 0 1px 8px rgba(15,31,61,0.04)",
        md:       "0 4px 12px -2px rgba(15,31,61,0.08), 0 1px 4px rgba(15,31,61,0.04)",
        lg:       "0 8px 24px -4px rgba(15,31,61,0.12), 0 2px 8px rgba(15,31,61,0.04)",
        xl:       "0 16px 48px -8px rgba(15,31,61,0.16), 0 4px 16px rgba(15,31,61,0.06)",
        "inner":  "inset 0 1px 2px rgba(0,0,0,0.06)",
        "premium-sm":  "0 1px 3px rgba(15,31,61,0.04), 0 4px 8px -2px rgba(15,31,61,0.06)",
        "premium":     "0 2px 8px -2px rgba(15,31,61,0.06), 0 8px 20px -4px rgba(15,31,61,0.08)",
        "premium-lg":  "0 4px 12px -2px rgba(15,31,61,0.06), 0 12px 32px -6px rgba(15,31,61,0.12)",
        "premium-xl":  "0 8px 20px -4px rgba(15,31,61,0.08), 0 20px 48px -8px rgba(15,31,61,0.16)",
        "glow-gold":   "0 0 20px rgba(179,139,0,0.15), 0 4px 12px -2px rgba(179,139,0,0.10)",
      },
      keyframes: {
        "pulse-dot": {
          "0%, 100%": { opacity: 1,   transform: "scale(1)"    },
          "50%":      { opacity: 0.4, transform: "scale(0.85)" },
        },
        "fade-in": {
          from: { opacity: 0, transform: "translateY(6px)" },
          to:   { opacity: 1, transform: "translateY(0)"   },
        },
        "slide-up": {
          from: { opacity: 0, transform: "translateY(16px)" },
          to:   { opacity: 1, transform: "translateY(0)"    },
        },
        "count-up": {
          from: { opacity: 0, transform: "translateY(8px)" },
          to:   { opacity: 1, transform: "translateY(0)"   },
        },
        "dropdown-in": {
          from: { opacity: 0, transform: "scale(0.95) translateY(-4px)" },
          to:   { opacity: 1, transform: "scale(1) translateY(0)"       },
        },
      },
      animation: {
        "pulse-dot":   "pulse-dot 1.8s ease-in-out infinite",
        "fade-in":     "fade-in 0.25s ease-out both",
        "slide-up":    "slide-up 0.4s ease-out both",
        "count-up":    "count-up 0.5s ease-out both",
        "dropdown-in": "dropdown-in 0.15s ease-out both",
      },
    },
  },
  plugins: [],
};