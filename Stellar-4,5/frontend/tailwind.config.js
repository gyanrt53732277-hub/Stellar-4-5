/** @type {import('tailwindcss').Config} */
export default {
  content: [
    "./index.html",
    "./src/**/*.{js,ts,jsx,tsx}",
  ],
  theme: {
    extend: {
      colors: {
        darkBg: "#0B0F19",
        darkCard: "#111827",
        darkBorder: "#1F2937",
        accent: {
          50: "#EEF2F6",
          100: "#D2E0EE",
          200: "#A7C3E1",
          300: "#7CA5D4",
          400: "#5188C7",
          500: "#3B82F6",
          600: "#2563EB",
          700: "#1D4ED8",
          800: "#1E40AF",
          900: "#1E3A8A",
        },
        freelancerGreen: "#10B981",
        clientPurple: "#8B5CF6",
        disputeRed: "#EF4444",
      },
    },
  },
  plugins: [],
}
