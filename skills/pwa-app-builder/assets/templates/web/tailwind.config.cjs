/** @type {import('tailwindcss').Config} */
const path = require('path');

module.exports = {
  content: [path.join(__dirname, 'index.html'), path.join(__dirname, 'src/**/*.{js,jsx}')],
  darkMode: 'class',
  theme: {
    extend: {
      colors: {
        {{BRAND_RAMP}}
        {{INK_RAMP}}
      },
      fontFamily: {
        sans: ['Cairo', 'Tajawal', 'system-ui', '-apple-system', 'Segoe UI', 'sans-serif'],
      },
      boxShadow: {
        card: '0 2px 12px -4px rgba(0,0,0,.15)',
        pop: '0 12px 40px -12px rgba(0,0,0,.35)',
      },
      keyframes: {
        'fade-up': { '0%': { opacity: 0, transform: 'translateY(8px)' }, '100%': { opacity: 1, transform: 'none' } },
        pop: { '0%': { opacity: 0, transform: 'scale(.9)' }, '60%': { transform: 'scale(1.03)' }, '100%': { opacity: 1, transform: 'scale(1)' } },
        'slide-in': { '0%': { transform: 'translateX(-100%)' }, '100%': { transform: 'none' } },
      },
      animation: {
        'fade-up': 'fade-up .25s ease-out both',
        pop: 'pop .3s ease-out both',
        'slide-in': 'slide-in .22s ease-out both',
      },
    },
  },
  plugins: [],
};
