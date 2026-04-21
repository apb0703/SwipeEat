/** @type {import('tailwindcss').Config} */
export default {
  content: ['./index.html', './src/**/*.{js,ts,jsx,tsx}'],
  theme: {
    extend: {
      colors: {
        surface: {
          DEFAULT: '#0f1117',
          card: '#1a1d27',
          elevated: '#22263a',
        },
        accent: {
          DEFAULT: '#6c63ff',
          hover: '#8b85ff',
        },
      },
    },
  },
  plugins: [],
}
