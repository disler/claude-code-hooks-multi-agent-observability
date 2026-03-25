/** @type {import('tailwindcss').Config} */
export default {
  content: [
    "./index.html",
    "./src/**/*.{vue,js,ts,jsx,tsx}",
  ],
  darkMode: 'class',
  theme: {
    extend: {
      screens: {
        'mobile': {'max': '699px'}, // Custom mobile breakpoint for < 700px
        'tablet': {'min': '700px', 'max': '1023px'},
        'short': {'raw': '(max-height: 400px)'}, // Custom breakpoint for height <= 400px
      },
      colors: {
        // Theme-aware colors using CSS custom properties
        'theme': {
          'primary': 'var(--theme-primary)',
          'primary-hover': 'var(--theme-primary-hover)',
          'primary-light': 'var(--theme-primary-light)',
          'primary-dark': 'var(--theme-primary-dark)',
          'bg': {
            'primary': 'var(--theme-bg-primary)',
            'secondary': 'var(--theme-bg-secondary)',
            'tertiary': 'var(--theme-bg-tertiary)',
            'quaternary': 'var(--theme-bg-quaternary)',
          },
          'text': {
            'primary': 'var(--theme-text-primary)',
            'secondary': 'var(--theme-text-secondary)',
            'tertiary': 'var(--theme-text-tertiary)',
            'quaternary': 'var(--theme-text-quaternary)',
          },
          'border': {
            'primary': 'var(--theme-border-primary)',
            'secondary': 'var(--theme-border-secondary)',
            'tertiary': 'var(--theme-border-tertiary)',
          },
          'accent': {
            'success': 'var(--theme-accent-success)',
            'warning': 'var(--theme-accent-warning)',
            'error': 'var(--theme-accent-error)',
            'info': 'var(--theme-accent-info)',
          }
        }
      },
      boxShadow: {
        'theme': 'var(--theme-shadow)',
        'theme-lg': 'var(--theme-shadow-lg)',
      },
      transitionProperty: {
        'theme': 'var(--theme-transition)',
        'theme-fast': 'var(--theme-transition-fast)',
      }
    },
  },
  plugins: [],
  safelist: [
    { pattern: /^bg-(blue|green|yellow|purple|pink|indigo|red|orange|teal|cyan)-500$/ },
    { pattern: /^border-(blue|green|yellow|purple|pink|indigo|red|orange|teal|cyan)-500$/ },
    { pattern: /^from-(blue|green|yellow|purple|pink|indigo|red|orange|teal|cyan)-500$/ },
    { pattern: /^to-(blue|green|yellow|purple|pink|indigo|red|orange|teal|cyan)-600$/ },
  ]
}