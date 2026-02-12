/** @type {import('tailwindcss').Config} */
export default {
  content: [
    "./src/**/*.{js,ts,jsx,tsx}",
  ],
  theme: {
    extend: {
      fontFamily: {
        display: ['"Playfair Display"', 'Georgia', 'serif'],
        body: ['"Source Sans 3"', '-apple-system', 'BlinkMacSystemFont', 'sans-serif'],
        mono: ['ui-monospace', 'SFMono-Regular', '"SF Mono"', 'Menlo', 'monospace'],
      },
      colors: {
        // Shadcn HSL variable colors (keep existing)
        border: "hsl(var(--border))",
        input: "hsl(var(--input))",
        ring: "hsl(var(--ring))",
        background: "hsl(var(--background))",
        foreground: "hsl(var(--foreground))",
        primary: {
          DEFAULT: "hsl(var(--primary))",
          foreground: "hsl(var(--primary-foreground))",
        },
        secondary: {
          DEFAULT: "hsl(var(--secondary))",
          foreground: "hsl(var(--secondary-foreground))",
        },
        destructive: {
          DEFAULT: "hsl(var(--destructive))",
          foreground: "hsl(var(--destructive-foreground))",
        },
        muted: {
          DEFAULT: "hsl(var(--muted))",
          foreground: "hsl(var(--muted-foreground))",
        },
        accent: {
          DEFAULT: "hsl(var(--accent))",
          foreground: "hsl(var(--accent-foreground))",
        },
        card: {
          DEFAULT: "hsl(var(--card))",
          foreground: "hsl(var(--card-foreground))",
        },
        // Nautical colors
        parchment: {
          DEFAULT: '#f5e6c8',
          dark: '#e8d5b7',
          darker: '#d4c5a0',
        },
        ink: {
          DEFAULT: '#2c1810',
          light: '#4a3728',
        },
        navy: {
          DEFAULT: '#0a1628',
          light: '#1a2744',
        },
        teal: {
          DEFAULT: '#0d9488',
          light: '#5eead4',
        },
        gold: {
          DEFAULT: '#d4a574',
          dark: '#b8956a',
        },
        storm: {
          red: '#991b1b',
          gray: '#334155',
        },
        seafoam: '#a7f3d0',
      },
      backgroundImage: {
        'parchment-gradient': 'linear-gradient(135deg, #f5e6c8 0%, #e8d5b7 50%, #d4c5a0 100%)',
        'ocean-gradient': 'linear-gradient(180deg, #0a1628 0%, #1a2744 50%, #0d4a5e 100%)',
        'storm-gradient': 'linear-gradient(180deg, #1a1a2e 0%, #334155 50%, rgba(153, 27, 27, 0.2) 100%)',
      },
      borderRadius: {
        lg: "var(--radius)",
        md: "calc(var(--radius) - 2px)",
        sm: "calc(var(--radius) - 4px)",
      },
      animation: {
        'ship-rock': 'ship-rock 3s ease-in-out infinite',
        'compass-spin': 'compass-needle 4s ease-in-out infinite',
        'fog-drift': 'fog-drift 8s ease-in-out infinite',
        'wave-gentle': 'wave-gentle 4s ease-in-out infinite',
        'wave-medium': 'wave-medium 3s ease-in-out infinite',
        'wave-storm': 'wave-storm 2s ease-in-out infinite',
        'parchment-unfurl': 'parchment-unfurl 0.5s ease-out',
        'beacon-rotate': 'beacon-rotate 3s linear infinite',
        'drift-pulse': 'drift-pulse 3s ease-in-out infinite',
      },
    },
  },
  plugins: [],
}
