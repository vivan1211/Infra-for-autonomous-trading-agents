import type { Config } from "tailwindcss";

const config: Config = {
  content: [
    "./src/pages/**/*.{js,ts,jsx,tsx,mdx}",
    "./src/components/**/*.{js,ts,jsx,tsx,mdx}",
    "./src/app/**/*.{js,ts,jsx,tsx,mdx}",
  ],
  theme: {
    extend: {
      colors: {
        gain: "#00C807",
        "gain-light": "rgba(0, 200, 7, 0.08)",
        loss: "#FF6B8A",
        "loss-light": "rgba(255, 107, 138, 0.1)",
        surface: "#0a0a0a",
        "surface-hover": "#111111",
        bg: "#000000",
        border: "#21262d",
        "text-primary": "#FFFFFF",
        "text-secondary": "#FFFFFF",
        "text-tertiary": "#999999",
        accent: "#00C807",
        warning: "#FFC107",
        "warning-light": "rgba(255, 193, 7, 0.1)",
      },
      fontFamily: {
        sans: ["CapsuleSansText", "system-ui", "sans-serif"],
        display: ["RHPhonic", "CapsuleSansText", "sans-serif"],
        serif: ["MartinaPlantijn", "Georgia", "serif"],
        mono: ["JetBrains Mono", "Menlo", "monospace"],
      },
      borderRadius: {
        card: "8px",
        pill: "9999px",
      },
      keyframes: {
        "flash-green": {
          "0%": { backgroundColor: "rgba(0, 200, 7, 0.08)" },
          "100%": { backgroundColor: "transparent" },
        },
        "flash-red": {
          "0%": { backgroundColor: "rgba(255, 107, 138, 0.08)" },
          "100%": { backgroundColor: "transparent" },
        },
        "fade-in": {
          "0%": { opacity: "0", transform: "translateY(8px)" },
          "100%": { opacity: "1", transform: "translateY(0)" },
        },
        "slide-up": {
          "0%": { opacity: "0", transform: "translateY(16px)" },
          "100%": { opacity: "1", transform: "translateY(0)" },
        },
        "pulse-dot": {
          "0%, 100%": { opacity: "1" },
          "50%": { opacity: "0.4" },
        },
        "row-highlight": {
          "0%": { backgroundColor: "rgba(0, 200, 7, 0.12)" },
          "70%": { backgroundColor: "rgba(0, 200, 7, 0.06)" },
          "100%": { backgroundColor: "transparent" },
        },
        "slide-in-right": {
          "0%": { transform: "translateX(100%)" },
          "100%": { transform: "translateX(0)" },
        },
      },
      animation: {
        "flash-green": "flash-green 0.8s ease-out",
        "flash-red": "flash-red 0.8s ease-out",
        "fade-in": "fade-in 0.4s ease-out",
        "slide-up": "slide-up 0.5s ease-out",
        "pulse-dot": "pulse-dot 2s ease-in-out infinite",
        "row-highlight": "row-highlight 3s ease-out forwards",
        "slide-in-right": "slide-in-right 0.25s ease-out forwards",
      },
    },
  },
  plugins: [],
};
export default config;
