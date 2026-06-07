/** @type {import('tailwindcss').Config} */
module.exports = {
  content: [
    "./app/**/*.{js,jsx}",
    "./components/**/*.{js,jsx}",
  ],
  theme: {
    extend: {
      colors: {
        // TEONE brand palette — corporate blue + white
        // Multi-brand: warna dari CSS variable (lihat globals.css)
        // TEONE = biru korporat, Khasanah = orange merah bata
        brand: {
          50: "rgb(var(--brand-50) / <alpha-value>)",
          100: "rgb(var(--brand-100) / <alpha-value>)",
          200: "rgb(var(--brand-200) / <alpha-value>)",
          300: "rgb(var(--brand-300) / <alpha-value>)",
          400: "rgb(var(--brand-400) / <alpha-value>)",
          500: "rgb(var(--brand-500) / <alpha-value>)",
          600: "rgb(var(--brand-600) / <alpha-value>)",
          700: "rgb(var(--brand-700) / <alpha-value>)",
          800: "rgb(var(--brand-800) / <alpha-value>)",
          900: "rgb(var(--brand-900) / <alpha-value>)",
        },
        slate: {
          // standard slate, kept for neutrals
        }
      },
      fontFamily: {
        sans: ['Inter', 'ui-sans-serif', 'system-ui', '-apple-system', 'sans-serif'],
      },
      boxShadow: {
        'card': '0 1px 3px rgba(10, 37, 64, 0.06), 0 1px 2px rgba(10, 37, 64, 0.04)',
        'card-hover': '0 4px 12px rgba(10, 37, 64, 0.08), 0 2px 4px rgba(10, 37, 64, 0.06)',
      }
    },
  },
  plugins: [],
};
