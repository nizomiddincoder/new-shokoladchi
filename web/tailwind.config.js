/** @type {import('tailwindcss').Config} */

// Ranglar styles.css dagi CSS o'zgaruvchilaridan olinadi (kun/tun rejimi shu orqali almashadi)
const c = (name) => `rgb(var(--c-${name}) / <alpha-value>)`;

export default {
  content: ['./app/index.html', './admin/index.html', './src/**/*.{ts,tsx}'],
  theme: {
    extend: {
      colors: {
        primary: {
          DEFAULT: c('primary'),
          dark: c('primary-dark'),
          light: c('primary-light'),
          soft: c('primary-soft'),
        },
        accent: c('accent'),
        bg: c('bg'),
        surface: c('surface'),
        card: c('card'),
        ink: c('ink'),
        muted: c('muted'),
        line: c('line'),
        danger: { DEFAULT: c('danger'), soft: c('danger-soft') },
        success: { DEFAULT: c('success'), soft: c('success-soft') },
        warning: { DEFAULT: c('warning'), soft: c('warning-soft') },
        info: { DEFAULT: c('info'), soft: c('info-soft') },
      },
      fontFamily: {
        // Matn: yumshoq, yumaloq Nunito; sarlavha va narxlar: shokolad butigi uslubidagi Playfair Display
        sans: ['Nunito', 'system-ui', 'sans-serif'],
        display: ['"Playfair Display"', 'Georgia', 'serif'],
      },
      borderRadius: {
        card: '16px',
      },
      boxShadow: {
        card: '0 2px 12px rgb(var(--c-shadow) / 0.08)',
        lift: '0 8px 24px rgb(var(--c-shadow) / 0.16)',
      },
    },
  },
  plugins: [],
};
