/** @type {import('tailwindcss').Config} */

export default {
  darkMode: "class",
  content: ["./index.html", "./src/**/*.{js,ts,jsx,tsx}"],
  theme: {
    container: {
      center: true,
    },
    extend: {
      colors: {
        primary: {
          DEFAULT: "#1B2A4A",
          50: "#E8ECF3",
          100: "#C5CDE1",
          200: "#9FADCE",
          300: "#798DBB",
          400: "#5C74AC",
          500: "#3F5B9D",
          600: "#365395",
          700: "#2B498B",
          800: "#1B2A4A",
          900: "#0F1B32",
        },
        accent: {
          DEFAULT: "#E85D3A",
          50: "#FDF0EC",
          100: "#FAD9CF",
          200: "#F5BFA9",
          300: "#F0A580",
          400: "#EB8E5E",
          500: "#E85D3A",
          600: "#D44A27",
          700: "#B03B1E",
          800: "#8C2E17",
          900: "#6A2211",
        },
      },
    },
  },
  plugins: [],
};
