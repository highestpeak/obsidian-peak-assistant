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
				background: 'var(--pk-bg, var(--background-primary))',
				card: 'var(--pk-surface)',
				popover: 'var(--pk-popover)',
				// Text colors
				foreground: 'var(--pk-fg-muted, #8C8C8C)',
				// Primary colors
				primary: {
					DEFAULT: 'var(--pk-info)',
					foreground: 'var(--pk-text-inverted)',
				},
				// Secondary colors
				secondary: {
					DEFAULT: 'var(--pk-surface-sunken)',
					foreground: 'var(--pk-text-primary)',
				},
				// Muted colors
				muted: {
					DEFAULT: 'var(--pk-surface-sunken)',
					foreground: 'var(--pk-text-secondary)',
				},
				// Accent colors
				accent: {
					DEFAULT: 'var(--pk-accent)',
					foreground: 'var(--pk-accent-fg)',
				},
				// Destructive colors
				destructive: {
					DEFAULT: 'var(--pk-error)',
					foreground: 'var(--pk-text-inverted)',
				},
				// Border colors
				border: 'var(--pk-border, rgba(128, 128, 128, 0.15))',
				'border-default': 'var(--pk-text-secondary)',
				'border-hover': 'var(--pk-info)',
				input: 'var(--pk-border, rgba(128, 128, 128, 0.2))',
				ring: 'var(--pk-info)',

				// ── Peak CSS variable colors (Obsidian-aware + dark-mode-safe) ──
				// Structural (Obsidian-aware)
				'pk-background': 'var(--pk-bg)',
				'pk-background-secondary': 'var(--pk-bg-secondary)',
				'pk-foreground': 'var(--pk-fg)',
				'pk-foreground-muted': 'var(--pk-fg-muted)',
				'pk-foreground-faint': 'var(--pk-fg-faint)',
				'pk-border': 'var(--pk-border)',

				// Brand
				'pk-accent': {
					DEFAULT: 'var(--pk-accent)',
					hover: 'var(--pk-accent-hover)',
					muted: 'var(--pk-accent-muted)',
					fg: 'var(--pk-accent-fg)',
				},

				// Semantic
				'pk-success': { DEFAULT: 'var(--pk-success)', muted: 'var(--pk-success-muted)' },
				'pk-warning': { DEFAULT: 'var(--pk-warning)', muted: 'var(--pk-warning-muted)' },
				'pk-error': { DEFAULT: 'var(--pk-error)', muted: 'var(--pk-error-muted)' },
				'pk-info': { DEFAULT: 'var(--pk-info)', muted: 'var(--pk-info-muted)' },

				// Surfaces (theme-aware opaque backgrounds)
				'pk-surface': 'var(--pk-surface)',
				'pk-surface-raised': 'var(--pk-surface-raised)',
				'pk-surface-sunken': 'var(--pk-surface-sunken)',
				'pk-surface-overlay': 'var(--pk-surface-overlay)',

				// Text (theme-aware opaque text colors)
				'pk-text-primary': 'var(--pk-text-primary)',
				'pk-text-secondary': 'var(--pk-text-secondary)',
				'pk-text-tertiary': 'var(--pk-text-tertiary)',
				'pk-text-inverted': 'var(--pk-text-inverted)',

				// Border extras
				'pk-border-light': 'var(--pk-border-light)',
				'pk-border-accent': 'var(--pk-border-accent)',

				// Skeleton / placeholder
				'pk-skeleton': 'var(--pk-skeleton)',

				// Interaction highlights
				'pk-highlight': 'var(--pk-highlight)',
				'pk-highlight-info': 'var(--pk-highlight-info)',
				'pk-highlight-info-border': 'var(--pk-highlight-info-border)',
			},
			borderRadius: {
				lg: '0.5rem', // 8px
				md: '0.375rem', // 6px
				sm: '0.25rem', // 4px
			},
			keyframes: {
				shimmer: {
					'0%': { 'background-position': '-200% 0' },
					'100%': { 'background-position': '200% 0' },
				},
				scanEffect: {
					'0%': { 'background-position': 'right' },
					'100%': { 'background-position': 'left' },
				},
				spin: {
					from: { transform: 'translateZ(0) rotate(0deg)' },
					to: { transform: 'translateZ(0) rotate(360deg)' },
				},
			},
			animation: {
				'scan': 'scanEffect 2s infinite',
			},
		},
	},
	plugins: [],
	corePlugins: {
		preflight: false, // Disable Tailwind's base styles to avoid conflicts with Obsidian
	},
};

