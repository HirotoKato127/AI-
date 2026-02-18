/** @type {import('tailwindcss').Config} */
module.exports = {
  content: [
    "./index.html",
    "./dashboard.html",
    "./pages/**/*.{html,js}",
    "./scripts/**/*.js",
    "./dashboard.js",
    "./chatbot/frontend/widget.js",
    "./chatbot/frontend/widget.css",
    "./chatbot/docs/**/*.md",
    "./styles/**/*.css",
  ],
  theme: {
    extend: {},
  },
  plugins: [],
};
