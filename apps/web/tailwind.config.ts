import type { Config } from "tailwindcss";

const config: Config = {
  darkMode: "class",
  content: ["./app/**/*.{ts,tsx}", "./components/**/*.{ts,tsx}"],
  theme: {
    extend: {
      colors: {
        background: "var(--background)",
        surface: "var(--surface)",
        "surface-2": "var(--surface-2)",
        "border-strong": "var(--border-strong)",
        violet: "var(--violet)",
        sky: "var(--sky)",
        border: "var(--border)",
        foreground: "var(--foreground)",
        muted: "var(--muted)",
        accent: "var(--accent)",
        success: "var(--success)",
        warning: "var(--warning)",
        danger: "var(--danger)",
      },
      fontFamily: {
        sans: ["var(--font-inter)", "Inter", "system-ui", "sans-serif"],
      },
      borderRadius: {
        card: "16px",
        btn: "12px",
      },
      maxWidth: {
        content: "1120px",
        feed: "640px",
      },
      width: {
        sidebar: "280px",
        "sidebar-collapsed": "72px",
      },
      height: {
        btn: "44px",
      },
    },
  },
  plugins: [],
};

export default config;
