/** @type {import('tailwindcss').Config} */
export default {
  content: ['./index.html', './src/**/*.{js,ts,jsx,tsx}'],
  theme: {
    screens: {
      'xs': '320px',
      'sm': '480px',
      'md': '768px',
      'lg': '1024px',
      'xl': '1280px',
      '2xl': '1536px',
    },
    extend: {
      colors: {
        // Base neutrals
        surface: {
          DEFAULT: '#F5F6F7',
          alt: '#FAFAFA',
          panel: '#ECEFF1',
          hover: '#E8EAED',
        },
        border: {
          DEFAULT: '#C5CBD3',
          light: '#D8DCE2',
          dark: '#A8B0BC',
        },
        text: {
          DEFAULT: '#1E1E1E',
          secondary: '#5F6B7A',
          muted: '#8A939F',
          inverse: '#FFFFFF',
        },
        // Accent colors (sparse, state-driven)
        accent: {
          DEFAULT: '#2F6FED',
          hover: '#3D7CF5',
          muted: '#4C6FA9',
        },
        success: {
          DEFAULT: '#2E7D32',
          hover: '#388E3C',
          bg: '#E8F5E9',
        },
        warning: {
          DEFAULT: '#C88719',
          hover: '#D69520',
          bg: '#FFF8E1',
        },
        danger: {
          DEFAULT: '#B23B3B',
          hover: '#C24545',
          bg: '#FFEBEE',
        },
      },
      fontSize: {
        '2xs': ['0.6875rem', { lineHeight: '1rem' }], // 11px (was 10px)
      },
      spacing: {
        '0.5': '0.125rem', // 2px
        '1.5': '0.375rem', // 6px
        '2.5': '0.625rem', // 10px
      },
      boxShadow: {
        'subtle': '0 1px 2px rgba(0, 0, 0, 0.04)',
        'panel': '0 1px 3px rgba(0, 0, 0, 0.06)',
        'drawer': '4px 0 16px rgba(0, 0, 0, 0.1)',
        'sheet': '0 -4px 16px rgba(0, 0, 0, 0.12)',
      },
      minHeight: {
        'touch': '44px',
      },
      minWidth: {
        'touch': '44px',
      },
      keyframes: {
        'slide-in-left': {
          '0%': { transform: 'translateX(-100%)' },
          '100%': { transform: 'translateX(0)' },
        },
        'slide-out-left': {
          '0%': { transform: 'translateX(0)' },
          '100%': { transform: 'translateX(-100%)' },
        },
        'slide-up': {
          '0%': { transform: 'translateY(100%)' },
          '100%': { transform: 'translateY(0)' },
        },
        'slide-down': {
          '0%': { transform: 'translateY(0)' },
          '100%': { transform: 'translateY(100%)' },
        },
        'fade-in': {
          '0%': { opacity: '0' },
          '100%': { opacity: '1' },
        },
        'fade-out': {
          '0%': { opacity: '1' },
          '100%': { opacity: '0' },
        },
      },
      animation: {
        'slide-in-left': 'slide-in-left 0.25s ease-out',
        'slide-out-left': 'slide-out-left 0.2s ease-in',
        'slide-up': 'slide-up 0.3s ease-out',
        'slide-down': 'slide-down 0.2s ease-in',
        'fade-in': 'fade-in 0.2s ease-out',
        'fade-out': 'fade-out 0.15s ease-in',
      },
    },
  },
  plugins: [],
};
