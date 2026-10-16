/** @type {import('tailwindcss').Config} */
export default {
  content: ['./index.html', './src/**/*.{js,ts,jsx,tsx}'],
  theme: {
    extend: {
      colors: {
        navy: { DEFAULT: '#12315a', dark: '#0b2342', soft: '#e8eef7' },
      },
      keyframes: {
        fade: { from: { opacity: '0' }, to: { opacity: '1' } },
        pop: { from: { opacity: '0', transform: 'translateY(8px) scale(.98)' }, to: { opacity: '1', transform: 'translateY(0) scale(1)' } },
      },
      animation: { fade: 'fade .18s ease-out', pop: 'pop .2s ease-out' },
    },
  },
  plugins: [],
};