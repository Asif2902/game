/** @type {import('tailwindcss').Config} */
module.exports = {
  content: [
    './app/**/*.{js,ts,jsx,tsx,mdx}',
    './components/**/*.{js,ts,jsx,tsx,mdx}',
  ],
  theme: {
    extend: {
      colors: {
        // Flappy Base palette
        base: {
          bg: '#0A1628',
          sky: '#6BBFED',
          horizon: '#A8D8F0',
          ground: '#1A3A6E',
          pipe: '#1E5CB3',
          'pipe-highlight': '#4A8FE0',
          'pipe-cap': '#1A4F9E',
          bird: '#F0E0B0',
          wing: '#4A80C8',
          beak: '#FF8000',
          button: '#2B6FD4',
          danger: '#FF3B3B',
          foreground: '#FFFFFF',
          'foreground-dim': 'rgba(255,255,255,0.7)',
          panel: 'rgba(200, 230, 255, 0.85)',
        },
      },
      fontFamily: {
        sans: ['var(--font-lilita-one)', 'system-ui', 'sans-serif'],
        display: ['var(--font-lilita-one)', 'system-ui', 'sans-serif'],
      },
      keyframes: {
        pulseBtn: {
          '0%, 100%': { transform: 'scale(1)', boxShadow: '0 0 0 0 rgba(107,191,237,0.6)' },
          '50%': { transform: 'scale(1.03)', boxShadow: '0 0 0 10px rgba(107,191,237,0)' },
        },
      },
      animation: {
        'pulse-btn': 'pulseBtn 1.4s ease-in-out infinite',
      },
    },
  },
  plugins: [],
};
