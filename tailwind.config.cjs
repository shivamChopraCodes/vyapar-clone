/** @type {import('tailwindcss').Config} */
module.exports = {
  content: [
    './src/renderer/index.html',
    './src/renderer/**/*.{js,jsx}'
  ],
  theme: {
    extend: {
      colors: {
        canvas: '#f6f5f2',
        ink: '#121212',
        muted: '#6b6b6b',
        accent: '#0c4a6e',
        accentSoft: '#d9e7ef',
        border: '#dedad3'
      },
      fontFamily: {
        display: ['"Space Grotesk"', 'system-ui', 'sans-serif'],
        body: ['"IBM Plex Sans"', 'system-ui', 'sans-serif']
      },
      boxShadow: {
        soft: '0 10px 30px rgba(12, 74, 110, 0.15)'
      }
    }
  },
  plugins: []
};
