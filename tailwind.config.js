/** @type {import('tailwindcss').Config} */
module.exports = {
	content: [
		'./src/**/*.{js,ts,jsx,tsx}',
		'./src/styles/tailwind.css',
	],
	prefix: 'pktw-',
	important: true, // Automatically add !important to all utilities to override Obsidian's global styles
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
				lg: '0.5rem', // 8px
				md: '0.375rem', // 6px
				sm: '0.25rem', // 4px
			},
		},
	},
	plugins: [],
	corePlugins: {
		preflight: false, // Disable Tailwind's base styles to avoid conflicts with Obsidian
	},
};

