/** @type {import('tailwindcss').Config} */
export default {
  content: ['./index.html', './src/**/*.{js,jsx}'],
  theme: {
    extend: {
      fontFamily: { sans: ['"Plus Jakarta Sans"', 'system-ui', 'sans-serif'] },
      colors: {
        ink: '#111827',
        muted: '#5B6472',
        ground: '#F5F6FA',
        line: '#E5E7EB',
        navy: { DEFAULT: '#1E1B4B', 700: '#312E81', 200: '#C7D2FE' },
        brand: { DEFAULT: '#3730A3', dark: '#2E2789', light: '#EEF0FB' },
        accent: { DEFAULT: '#EA580C', text: '#C2410C' },
      },
    },
  },
  plugins: [],
};
