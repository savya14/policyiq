/** @type {import('tailwindcss').Config} */
export default {
  content: ['./index.html', './src/**/*.{js,jsx}'],
  theme: {
    extend: {
      colors: {
        navy: {
          DEFAULT: '#1a237e',
          light: '#283593',
          dark: '#0d1257',
        },
        orange: {
          DEFAULT: '#f57c00',
          dark: '#e65100',
          light: '#ff9800',
        },
      },
      fontFamily: {
        sans: ['Inter', 'system-ui', 'sans-serif'],
      },
    },
  },
  plugins: [],
}
