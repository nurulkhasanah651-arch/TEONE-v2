/** @type {import('tailwindcss').Config} */
export default {
  content: [
    "./app/**/*.{js,jsx}",
    "./components/**/*.{js,jsx}",
  ],
  theme: {
    extend: {
      colors: {
        // TEONE brand palette — corporate blue + white
        brand: {
          50: "#F0F7FF",
          100: "#E7F1FE",
          200: "#C6E0FB",
          300: "#9AC7F7",
          400: "#60A5F0",
          500: "#0570DE",  // primary
          600: "#0560C2",
          700: "#0A2540",  // dark navy
          800: "#072036",
          900: "#041629",
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
