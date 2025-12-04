/** @type {import('tailwindcss').Config} */
module.exports = {
	content: [
		'./src/ui/react/**/*.{ts,tsx}',
		'./src/ui/component/shared-ui/**/*.{ts,tsx}',
	],
	prefix: 'pktw-',
	theme: {
		extend: {
			colors: {
				background: 'var(--background-primary)',
				foreground: 'var(--text-normal)',
				primary: {
					DEFAULT: 'var(--interactive-accent)',
					foreground: 'var(--text-on-accent)',
				},
				secondary: {
					DEFAULT: 'var(--background-secondary)',
					foreground: 'var(--text-normal)',
				},
				muted: {
					DEFAULT: 'var(--background-modifier-hover)',
					foreground: 'var(--text-muted)',
				},
				accent: {
					DEFAULT: 'var(--interactive-accent)',
					foreground: 'var(--text-on-accent)',
				},
				destructive: {
					DEFAULT: 'var(--text-error)',
					foreground: 'var(--text-on-accent)',
				},
				border: 'var(--background-modifier-border)',
				input: 'var(--background-modifier-border)',
				ring: 'var(--interactive-accent)',
			},
			borderRadius: {
				lg: 'var(--radius)',
				md: 'calc(var(--radius) - 2px)',
				sm: 'calc(var(--radius) - 4px)',
			},
		},
	},
	plugins: [],
	corePlugins: {
		preflight: false, // Disable Tailwind's base styles to avoid conflicts with Obsidian
	},
};

