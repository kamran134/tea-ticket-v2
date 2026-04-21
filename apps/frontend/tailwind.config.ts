import type { Config } from 'tailwindcss';

export default {
  content: ['./*.html', './src/**/*.{ts,tsx}'],
  theme: {
    extend: {},
  },
  plugins: [],
} satisfies Config;
