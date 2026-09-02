/** @type {import('tailwindcss').Config} */
export default {
  darkMode: "class",
  content: ["./index.html", "./src/**/*.{js,jsx}"],
  theme: {
    extend: {
      fontWeight: {
        600: "600",
        700: "700",
      },
    },
  },
  plugins: [],
};
