/** @type {import('tailwindcss').Config} */
module.exports = {
  // 스캔 대상: 루트 HTML + assets/js 모든 파일 (program 폴더 제외)
  content: [
    './*.html',
    './assets/js/**/*.js',
  ],
  theme: {
    extend: {
      fontFamily: {
        sans: ['Pretendard', 'sans-serif'],
      },
      colors: {
        brand: {
          50:  '#f0fdf4',
          100: '#dcfce7',
          200: '#bbf7d0',
          300: '#86efac',
          400: '#4ade80',
          500: '#22c55e',
          600: '#16a34a',
          700: '#15803d',
          800: '#166534',
          900: '#14532d',
        },
        navy: {
          800: '#1e293b',
          900: '#0f172a',
        },
        office: {
          bg:    '#f8fafc',
          paper: '#ffffff',
          line:  '#e2e8f0',
          text:  '#334155',
        },
      },
      boxShadow: {
        'soft':  '0 4px 20px -5px rgba(0,0,0,0.05)',
        'hard':  '0 4px 0 0 rgba(21, 128, 61, 0.2)',
        'card':  '0 1px 3px 0 rgba(0, 0, 0, 0.1), 0 1px 2px 0 rgba(0, 0, 0, 0.06)',
        'paper': '0 1px 3px 0 rgba(0, 0, 0, 0.1), 0 1px 2px 0 rgba(0, 0, 0, 0.06)',
        'float': '0 10px 30px -5px rgba(0, 0, 0, 0.05)',
      },
      animation: {
        'fade-in':       'fadeIn 0.5s ease-out forwards',
        'slide-up':      'slideUp 0.6s cubic-bezier(0.16, 1, 0.3, 1) forwards',
        'float':         'float 6s ease-in-out infinite',
        'float-delayed': 'float 6s ease-in-out 3s infinite',
        'gradient-x':    'gradientX 5s ease infinite',
      },
      keyframes: {
        fadeIn: {
          '0%':   { opacity: '0' },
          '100%': { opacity: '1' },
        },
        slideUp: {
          '0%':   { transform: 'translateY(20px)', opacity: '0' },
          '100%': { transform: 'translateY(0)',    opacity: '1' },
        },
        float: {
          '0%, 100%': { transform: 'translateY(0px)' },
          '50%':      { transform: 'translateY(-15px)' },
        },
        gradientX: {
          '0%, 100%': { backgroundPosition: '0% 50%' },
          '50%':      { backgroundPosition: '100% 50%' },
        },
      },
    },
  },
  plugins: [],
};
