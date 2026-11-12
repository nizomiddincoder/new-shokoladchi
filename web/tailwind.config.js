/** @type {import('tailwindcss').Config} */
export default {
  content: ['./app/index.html', './admin/index.html', './src/**/*.{ts,tsx}'],
  theme: {
    extend: {
      colors: {
        // styles.css dagi --primary va boshqa CSS o'zgaruvchilari bilan bir xil (opacity modifikatorlari ishlashi uchun hex)
        primary: {
          DEFAULT: '#6F4E37',
          dark: '#4A3224',
          light: '#A47551',
          soft: '#F3ECE6',
        },
        accent: '#D9A066',
        bg: '#FFFFFF',
        surface: '#FAF7F5',
        ink: '#2B1D14',
        muted: '#8C7B70',
        line: '#EADFD7',
        danger: '#C0392B',
        success: '#2E7D32',
      },
      fontFamily: {
        sans: ['"Plus Jakarta Sans"', 'Inter', 'system-ui', 'sans-serif'],
      },
      borderRadius: {
        card: '16px',
      },
      boxShadow: {
        card: '0 2px 12px rgba(74, 50, 36, 0.06)',
        lift: '0 8px 24px rgba(74, 50, 36, 0.12)',
      },
    },
  },
  plugins: [],
};
