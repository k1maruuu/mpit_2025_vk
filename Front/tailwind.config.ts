import type { Config } from "tailwindcss";

export default {
  content: [
    "./pages/**/*.{ts,tsx}",         // Включаем все файлы в pages
    "./components/**/*.{ts,tsx}",    // Включаем все файлы в components
    "./app/**/*.{ts,tsx}",
  ],
  theme: {
    extend: {
      colors: {
        background: "var(--background)",
        foreground: "var(--foreground)",
      },
      purple: {
        300: "#A78BFA",
        500: "#9333EA",
      },
    },
  },

  plugins: [],
} satisfies Config;
