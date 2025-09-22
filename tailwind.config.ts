import type { Config } from "tailwindcss";

const config: Config = {
  content: [
    "./app/**/*.{ts,tsx}",
    "./components/**/*.{ts,tsx}",
    "./lib/**/*.{ts,tsx}",
  ],
  theme: {
    extend: {
      colors: {
        primary: {
          DEFAULT: "#1f8b4c",
          foreground: "#ffffff",
        },
        accent: {
          DEFAULT: "#fbbf24",
          foreground: "#1f2937",
        },
      },
    },
  },
  plugins: [],
};

export default config;
