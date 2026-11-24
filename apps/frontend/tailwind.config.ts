import type { Config } from 'tailwindcss';

/**
 * Brand palette mirrors the gold accent used in the site footer/header
 * (bir-manat-experience). Keep these values in sync with `--footer-accent`
 * in src/styles/main.css.
 */
export default {
  content: ['./*.html', './src/**/*.{ts,tsx}'],
  darkMode: 'class',
  theme: {
    extend: {
      colors: {
        brand: {
          DEFAULT: '#d4af37',
          hover: '#e7c766',
          deep: '#a17c2a',
        },
      },
    },
  },
  plugins: [],
} satisfies Config;
