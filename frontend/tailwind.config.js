/** @type {import('tailwindcss').Config} */
export default {
  content: ['./index.html', './src/**/*.{ts,tsx}'],
  theme: {
    extend: {
      colors: {
        brand: {
          red: '#dc2626',
          green: '#16a34a',
          blue: '#2563eb',
          warning: '#d97706'
        }
      },
      fontFamily: {
        sans: [
          'Vazirmatn',
          'Vazir',
          'Tahoma',
          'Segoe UI',
          'system-ui',
          'sans-serif'
        ]
      }
    }
  },
  plugins: []
};