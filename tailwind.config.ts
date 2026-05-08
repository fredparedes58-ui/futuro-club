import type { Config } from "tailwindcss";

export default {
  darkMode: ["class"],
  content: ["./pages/**/*.{ts,tsx}", "./components/**/*.{ts,tsx}", "./app/**/*.{ts,tsx}", "./src/**/*.{ts,tsx}"],
  prefix: "",
  theme: {
    container: {
      center: true,
      padding: "2rem",
      screens: {
        "2xl": "1400px",
      },
    },
    extend: {
      fontFamily: {
        // Sistema tipográfico VITAS
        sans:     ["Geist", "ui-sans-serif", "system-ui", "sans-serif"],
        display:  ["Geist", "ui-sans-serif", "system-ui", "sans-serif"],
        body:     ["Geist", "ui-sans-serif", "system-ui", "sans-serif"],
        mono:     ["Geist Mono", "ui-monospace", "SFMono-Regular", "monospace"],
        tactical: ["Rajdhani", "Geist", "sans-serif"], // identidad deportiva
      },
      fontSize: {
        // Escala tipográfica calibrada · 7 tamaños con line-height + letter-spacing
        "2xs":   ["10px",  { lineHeight: "14px", letterSpacing: "0.01em" }],
        xs:      ["11px",  { lineHeight: "16px", letterSpacing: "0.005em" }],
        sm:      ["13px",  { lineHeight: "20px", letterSpacing: "0" }],
        base:    ["15px",  { lineHeight: "24px", letterSpacing: "-0.005em" }],
        lg:      ["17px",  { lineHeight: "26px", letterSpacing: "-0.01em" }],
        xl:      ["20px",  { lineHeight: "28px", letterSpacing: "-0.015em" }],
        "2xl":   ["24px",  { lineHeight: "32px", letterSpacing: "-0.02em" }],
        "3xl":   ["30px",  { lineHeight: "36px", letterSpacing: "-0.025em" }],
        "4xl":   ["36px",  { lineHeight: "40px", letterSpacing: "-0.03em" }],
        "5xl":   ["48px",  { lineHeight: "52px", letterSpacing: "-0.035em" }],
        "6xl":   ["60px",  { lineHeight: "62px", letterSpacing: "-0.04em" }],
      },
      colors: {
        border: "hsl(var(--border))",
        input: "hsl(var(--input))",
        ring: "hsl(var(--ring))",
        background: "hsl(var(--background))",
        foreground: "hsl(var(--foreground))",
        primary: {
          DEFAULT: "hsl(var(--primary))",
          foreground: "hsl(var(--primary-foreground))",
        },
        secondary: {
          DEFAULT: "hsl(var(--secondary))",
          foreground: "hsl(var(--secondary-foreground))",
        },
        destructive: {
          DEFAULT: "hsl(var(--destructive))",
          foreground: "hsl(var(--destructive-foreground))",
        },
        muted: {
          DEFAULT: "hsl(var(--muted))",
          foreground: "hsl(var(--muted-foreground))",
        },
        accent: {
          DEFAULT: "hsl(var(--accent))",
          foreground: "hsl(var(--accent-foreground))",
        },
        popover: {
          DEFAULT: "hsl(var(--popover))",
          foreground: "hsl(var(--popover-foreground))",
        },
        card: {
          DEFAULT: "hsl(var(--card))",
          foreground: "hsl(var(--card-foreground))",
        },
        neon: "hsl(var(--neon))",
        electric: "hsl(var(--electric))",
        gold: "hsl(var(--gold))",
        danger: "hsl(var(--danger))",
        cyan: "hsl(var(--cyan))",
        "hot-pink": "hsl(var(--hot-pink))",
        surface: {
          elevated: "hsl(var(--surface-elevated))",
        },
        sidebar: {
          DEFAULT: "hsl(var(--sidebar-background))",
          foreground: "hsl(var(--sidebar-foreground))",
          primary: "hsl(var(--sidebar-primary))",
          "primary-foreground": "hsl(var(--sidebar-primary-foreground))",
          accent: "hsl(var(--sidebar-accent))",
          "accent-foreground": "hsl(var(--sidebar-accent-foreground))",
          border: "hsl(var(--sidebar-border))",
          ring: "hsl(var(--sidebar-ring))",
        },
      },
      borderRadius: {
        lg: "var(--radius)",
        md: "calc(var(--radius) - 2px)",
        sm: "calc(var(--radius) - 4px)",
      },
      keyframes: {
        "accordion-down": {
          from: { height: "0" },
          to: { height: "var(--radix-accordion-content-height)" },
        },
        "accordion-up": {
          from: { height: "var(--radix-accordion-content-height)" },
          to: { height: "0" },
        },
        "slide-up": {
          from: { transform: "translateY(100%)", opacity: "0" },
          to: { transform: "translateY(0)", opacity: "1" },
        },
        "fade-in": {
          from: { opacity: "0" },
          to: { opacity: "1" },
        },
        "scale-in": {
          from: { transform: "scale(0.95)", opacity: "0" },
          to: { transform: "scale(1)", opacity: "1" },
        },
      },
      animation: {
        "accordion-down": "accordion-down 0.2s ease-out",
        "accordion-up": "accordion-up 0.2s ease-out",
        "slide-up": "slide-up 0.4s ease-out",
        "fade-in": "fade-in 0.3s ease-out",
        "scale-in": "scale-in 0.3s ease-out",
      },
    },
  },
  plugins: [require("tailwindcss-animate")],
} satisfies Config;
