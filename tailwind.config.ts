import type { Config } from 'tailwindcss'

const config: Config = {
  content: ['./src/**/*.{js,ts,jsx,tsx,mdx}'],
  darkMode: 'class',
  theme: {
    extend: {
      colors: {
        primary: '#f97316',
        secondary: '#1e293b',
      },
    },
  },
  plugins: [],
}

export default config
