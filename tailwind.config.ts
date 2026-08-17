import type { Config } from "tailwindcss";
const config: Config = {
  content: ["./app/**/*.{ts,tsx}", "./components/**/*.{ts,tsx}"],
  theme: {
    extend: {
      colors: {
        brand: {
          50: "#F4F7FB", 100: "#E8EFF9", 200: "#CDDDF3", 300: "#9FBFE8",
          400: "#6C9BDB", 500: "#2F63F6", 600: "#1D4ED8", 700: "#173FB0",
          800: "#122E7E", 900: "#0C1E52", ink: "#101828", rail: "#0B1526"
        },
        pastel: {
          pink: "#FCE7F3", blue: "#DBEAFE", yellow: "#FEF9C3", violet: "#EDE9FE", green: "#DCFCE7"
        }
      },
      fontFamily: {
        display: ["'Plus Jakarta Sans'", "system-ui", "sans-serif"],
        body: ["'Plus Jakarta Sans'", "'Inter'", "system-ui", "sans-serif"]
      },
      boxShadow: {
        card: "0 1px 2px rgba(16,24,40,.06), 0 6px 20px rgba(16,24,40,.05)"
      }
    }
  },
  plugins: []
};
export default config;
