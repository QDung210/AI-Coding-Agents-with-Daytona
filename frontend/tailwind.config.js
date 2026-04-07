/** @type {import('tailwindcss').Config} */
export default {
  content: ['./index.html', './src/**/*.{ts,tsx}'],
  theme: {
    extend: {
      colors: {
        background: '#020617',
        surface: '#0F172A',
        'surface-2': '#1E293B',
        accent: '#22C55E',
        foreground: '#F8FAFC',
        muted: '#94A3B8',
        border: '#334155',
        destructive: '#EF4444',
        warning: '#EAB308',
        info: '#3B82F6',
      },
      fontFamily: {
        mono: ['JetBrains Mono', 'monospace'],
      },
    },
  },
  plugins: [],
}
