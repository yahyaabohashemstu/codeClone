import type { Config } from "tailwindcss";

export default {
	darkMode: ["class"],
	content: [
		"./pages/**/*.{ts,tsx}",
		"./components/**/*.{ts,tsx}",
		"./app/**/*.{ts,tsx}",
		"./src/**/*.{ts,tsx}",
	],
	prefix: "",
	theme: {
		container: {
			center: true,
			padding: '2.5rem',
			screens: {
				'2xl': '1440px'
			}
		},
		extend: {
			fontFamily: {
				sans: ['Sofia Sans', 'system-ui', '-apple-system', 'Segoe UI', 'sans-serif'],
				mono: ['IBM Plex Mono', 'ui-monospace', 'Cascadia Code', 'Consolas', 'monospace'],
				display: ['Sofia Sans Extra Condensed', 'Sofia Sans', 'system-ui', 'sans-serif'],
			},
			colors: {
				border: 'hsl(var(--border))',
				input: 'hsl(var(--input))',
				ring: 'hsl(var(--ring))',
				background: 'hsl(var(--background))',
				foreground: 'hsl(var(--foreground))',
				primary: {
					DEFAULT: 'hsl(var(--primary))',
					foreground: 'hsl(var(--primary-foreground))'
				},
				secondary: {
					DEFAULT: 'hsl(var(--secondary))',
					foreground: 'hsl(var(--secondary-foreground))'
				},
				destructive: {
					DEFAULT: 'hsl(var(--destructive))',
					foreground: 'hsl(var(--destructive-foreground))'
				},
				muted: {
					DEFAULT: 'hsl(var(--muted))',
					foreground: 'hsl(var(--muted-foreground))'
				},
				accent: {
					DEFAULT: 'hsl(var(--accent))',
					foreground: 'hsl(var(--accent-foreground))'
				},
				success: {
					DEFAULT: 'hsl(var(--success))',
					foreground: 'hsl(var(--success-foreground))'
				},
				warning: {
					DEFAULT: 'hsl(var(--warning))',
					foreground: 'hsl(var(--warning-foreground))'
				},
				'accent-suspect': 'hsl(var(--accent-suspect))',
				'plate-a': {
					DEFAULT: 'hsl(var(--plate-a))',
					deep: 'hsl(var(--plate-a-deep))'
				},
				'plate-b': {
					DEFAULT: 'hsl(var(--plate-b))',
					deep: 'hsl(var(--plate-b-deep))'
				},
				/* The bench design tokens, exact hex values from the design file. */
				bench: {
					base: 'var(--bench-base)',
					raised: 'var(--bench-raised)',
					well: 'var(--bench-well)',
					hair: 'var(--bench-hair)',
					strong: 'var(--bench-hair-strong)',
					tick: 'var(--bench-tick)',
				},
				txt: {
					primary: 'var(--text-primary)',
					secondary: 'var(--text-secondary)',
					muted: 'var(--text-muted)',
					faint: 'var(--text-faint)',
				},
				signal: {
					DEFAULT: 'var(--signal-base)',
					bench: 'var(--signal-on-bench)',
					plate: 'var(--signal-on-plate)',
				},
				plate: {
					base: 'var(--plate-base)',
					strip: 'var(--plate-strip)',
					hair: 'var(--plate-hair)',
					ink: 'var(--plate-ink)',
					soft: 'var(--plate-ink-soft)',
					gutter: 'var(--plate-gutter)',
					placeholder: 'var(--plate-placeholder)',
					well: 'var(--plate-well)',
					stroke: 'var(--plate-well-stroke)',
					meter: 'var(--plate-meter)',
				},
				match: {
					band: 'var(--match-band)',
					guard: 'var(--match-guard-band)',
					marker: 'var(--match-guard-marker)',
				},
				chart: {
					'1': 'hsl(var(--chart-1))',
					'2': 'hsl(var(--chart-2))',
					'3': 'hsl(var(--chart-3))',
					'4': 'hsl(var(--chart-4))',
					'5': 'hsl(var(--chart-5))',
				},
				popover: {
					DEFAULT: 'hsl(var(--popover))',
					foreground: 'hsl(var(--popover-foreground))'
				},
				card: {
					DEFAULT: 'hsl(var(--card))',
					foreground: 'hsl(var(--card-foreground))'
				},
				sidebar: {
					DEFAULT: 'hsl(var(--sidebar-background))',
					foreground: 'hsl(var(--sidebar-foreground))',
					primary: 'hsl(var(--sidebar-primary))',
					'primary-foreground': 'hsl(var(--sidebar-primary-foreground))',
					accent: 'hsl(var(--sidebar-accent))',
					'accent-foreground': 'hsl(var(--sidebar-accent-foreground))',
					border: 'hsl(var(--sidebar-border))',
					ring: 'hsl(var(--sidebar-ring))'
				},
			},
			/* Controls trim at 2px (the design's radius/control); the scale is
			   wired to tokens so the whole app follows a single knob. */
			borderRadius: {
				lg: 'var(--radius-lg)',
				md: 'var(--radius-md)',
				sm: 'var(--radius-sm)',
				xl: 'var(--radius-xl)',
				'2xl': 'var(--radius-2xl)',
			},
			keyframes: {
				'accordion-down': {
					from: { height: '0' },
					to: { height: 'var(--radix-accordion-content-height)' }
				},
				'accordion-up': {
					from: { height: 'var(--radix-accordion-content-height)' },
					to: { height: '0' }
				},
				'fade-in': {
					from: { opacity: '0' },
					to: { opacity: '1' }
				},
				/* The needle settling on its reading. */
				'needle-in': {
					from: { transform: 'scaleX(0)' },
					to: { transform: 'scaleX(1)' }
				},
			},
			animation: {
				'accordion-down': 'accordion-down 0.2s ease-out',
				'accordion-up': 'accordion-up 0.2s ease-out',
				'fade-in': 'fade-in 0.24s ease-out',
				'needle-in': 'needle-in 0.6s cubic-bezier(0.22, 1, 0.36, 1) both',
			},
		}
	},
	plugins: [require("tailwindcss-animate")],
} satisfies Config;
