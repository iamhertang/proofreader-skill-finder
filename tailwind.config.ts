import type { Config } from 'tailwindcss'

const config: Config = {
  content: [
    './app/**/*.{js,ts,jsx,tsx,mdx}',
    './components/**/*.{js,ts,jsx,tsx,mdx}',
  ],
  theme: {
    extend: {
      colors: {
        coral: '#FF6B6B',
        seafoam: '#4ECDC4',
        mint: '#95E1D3',
        gold: '#FFE66D',
      },
    },
  },
  plugins: [],
}

export default config
