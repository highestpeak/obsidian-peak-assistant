/** @type {import('tailwindcss').Config} */
module.exports = {
	content: [
		'./node_modules/streamdown/dist/*.js',
		'./src/**/*.{js,ts,jsx,tsx}',
		'./src/styles/tailwind.css',
	],
	prefix: 'pktw-',
	important: true, // Automatically add !important to all utilities to override Obsidian's global styles
	theme: {
		extend: {
			colors: {
				// Background colors
				background: '#282828',
				card: '#ffffff',
				popover: '#ffffff',
				// Text colors
				foreground: '#8C8C8C',
				// Primary colors
				primary: {
					DEFAULT: '#3b82f6',
					foreground: '#ffffff',
				},
				// Secondary colors
				secondary: {
					DEFAULT: '#f3f4f6',
					foreground: '#1a1a1a',
				},
				// Muted colors
				muted: {
					DEFAULT: '#f3f4f6',
					foreground: '#8C8C8C',
				},
				// Accent colors
				accent: {
					DEFAULT: '#3b82f6',
					foreground: '#ffffff',
				},
				// Destructive colors
				destructive: {
					DEFAULT: '#ef4444',
					foreground: '#ffffff',
				},
				// Border colors
				border: 'rgba(128, 128, 128, 0.15)',
				'border-default': '#666666',
				'border-hover': '#3b82f6',
				input: 'rgba(128, 128, 128, 0.2)',
				ring: '#3b82f6',
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

