/** @type {import('tailwindcss').Config} */
export default {
  content: ['./index.html', './src/**/*.{js,ts,jsx,tsx}'],
  theme: {
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
        '2xs': ['0.625rem', { lineHeight: '0.875rem' }], // 10px
      },
      spacing: {
        '0.5': '0.125rem', // 2px
        '1.5': '0.375rem', // 6px
        '2.5': '0.625rem', // 10px
      },
      boxShadow: {
        'subtle': '0 1px 2px rgba(0, 0, 0, 0.04)',
        'panel': '0 1px 3px rgba(0, 0, 0, 0.06)',
      },
    },
  },
  plugins: [],
};
