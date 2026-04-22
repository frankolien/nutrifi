import type { Config } from "tailwindcss";

/**
 * Tailwind config — intentionally locked down.
 *
 * We **do not** extend the default palette. We *replace* it entirely so
 * the only available colors are the four in our system: `bg`, `fg`
 * (with opacity variants via the /xx syntax), `accent`, and `alert`.
 * If you try `text-blue-500` or `bg-slate-900`, Tailwind will tell you
 * the class doesn't exist — by design. This is how we keep the UI
 * from drifting over time.
 *
 * Typography is also hard-capped. Two families, each with a small
 * number of weights. No arbitrary `font-display` choices.
 */
const config: Config = {
  content: ["./index.html", "./src/**/*.{ts,tsx}"],
  theme: {
    colors: {
      transparent: "transparent",
      current: "currentColor",
      inherit: "inherit",
      bg: "#0A0A0A",
      surface: "#111111",
      fg: {
        DEFAULT: "#FAFAFA",
        muted: "rgba(250, 250, 250, 0.60)",
        subtle: "rgba(250, 250, 250, 0.40)",
        dim: "rgba(250, 250, 250, 0.20)",
      },
      border: {
        DEFAULT: "rgba(255, 255, 255, 0.08)",
        strong: "rgba(255, 255, 255, 0.12)",
      },
      accent: {
        DEFAULT: "#6BBF8A",
        dim: "rgba(107, 191, 138, 0.60)",
        subtle: "rgba(107, 191, 138, 0.12)",
      },
      alert: {
        DEFAULT: "#D4665A",
        dim: "rgba(212, 102, 90, 0.60)",
        subtle: "rgba(212, 102, 90, 0.12)",
      },
    },
    fontFamily: {
      sans: ["Inter", "system-ui", "sans-serif"],
      mono: ["JetBrains Mono", "ui-monospace", "monospace"],
    },
    fontSize: {
      "2xs": ["11px", { lineHeight: "16px", letterSpacing: "0.04em" }],
      xs: ["12px", { lineHeight: "16px" }],
      sm: ["13px", { lineHeight: "20px" }],
      base: ["14px", { lineHeight: "20px" }],
      lg: ["16px", { lineHeight: "24px" }],
      xl: ["20px", { lineHeight: "28px" }],
      "2xl": ["28px", { lineHeight: "32px", letterSpacing: "-0.01em" }],
      "3xl": ["40px", { lineHeight: "44px", letterSpacing: "-0.02em" }],
      "4xl": ["56px", { lineHeight: "56px", letterSpacing: "-0.03em" }],
      "5xl": ["72px", { lineHeight: "72px", letterSpacing: "-0.03em" }],
    },
    borderRadius: {
      none: "0",
      xs: "2px",
      sm: "4px",
      DEFAULT: "6px",
      md: "6px",
      lg: "8px",
      full: "9999px",
    },
    extend: {
      spacing: {
        18: "4.5rem",
      },
      maxWidth: {
        page: "1200px",
        readable: "720px",
        action: "480px",
      },
    },
  },
  plugins: [],
};

export default config;
