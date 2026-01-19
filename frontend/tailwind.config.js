module.exports = {
  content: ["./index.html", "./src/**/*.{js,jsx,ts,tsx}"],
  theme: {
    extend: {
      borderRadius: {
        card: "var(--card-radius)",
      },
      colors: {
        app: "var(--app-bg)",
        text: "var(--text-main)",
        muted: "var(--text-muted)",
        accent: "var(--accent)",
      },
      fontFamily: {
        sans: "var(--font-sans)",
        display: "var(--font-display)",
      },
      boxShadow: {
        soft: "var(--shadow-soft)",
      },
      animation: {
        "spin-slow": "spin 8s linear infinite",
      },
    },
  },
  plugins: [],
};
