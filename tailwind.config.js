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
				// ── shadcn-style aliases (kept for shadcn components) ──
				background: 'var(--pk-bg)',
				card: 'var(--pk-surface)',
				popover: {
					DEFAULT: 'var(--pk-surface-overlay)',
					foreground: 'var(--pk-text-primary)',
				},
				foreground: 'var(--pk-text-primary)',
				primary: {
					DEFAULT: 'var(--pk-info)',
					foreground: 'var(--pk-text-inverted)',
				},
				secondary: {
					DEFAULT: 'var(--pk-surface-sunken)',
					foreground: 'var(--pk-text-primary)',
				},
				muted: {
					DEFAULT: 'var(--pk-surface-sunken)',
					foreground: 'var(--pk-text-secondary)',
				},
				accent: {
					DEFAULT: 'var(--pk-accent)',
					foreground: 'var(--pk-accent-fg)',
				},
				destructive: {
					DEFAULT: 'var(--pk-error)',
					foreground: 'var(--pk-text-inverted)',
				},
				border: 'var(--pk-border)',
				'border-default': 'var(--pk-border)',
				'border-hover': 'var(--pk-info)',
				input: 'var(--pk-border)',
				ring: 'var(--pk-info)',

				// ── Peak token utilities (canonical) ──
				'pk-background': 'var(--pk-bg)',
				'pk-background-secondary': 'var(--pk-bg-secondary)',
				'pk-foreground': 'var(--pk-text-primary)',         // alias kept; canonical = pk-text-primary
				'pk-foreground-muted': 'var(--pk-text-secondary)',
				'pk-foreground-faint': 'var(--pk-text-tertiary)',
				'pk-border': 'var(--pk-border)',

				// Brand
				'pk-accent': {
					DEFAULT: 'var(--pk-accent)',
					hover: 'var(--pk-accent-hover)',
					muted: 'var(--pk-accent-tint)',                 // legacy "muted" = new "tint"
					tint: 'var(--pk-accent-tint)',
					soft: 'var(--pk-accent-soft)',
					text: 'var(--pk-accent-text)',
					fg: 'var(--pk-accent-fg)',
				},

				// Semantic
				'pk-success': {
					DEFAULT: 'var(--pk-success)',
					muted: 'var(--pk-success-bg)',                  // legacy alias
					bg: 'var(--pk-success-bg)',
					text: 'var(--pk-success-text)',
				},
				'pk-warning': {
					DEFAULT: 'var(--pk-warning)',
					muted: 'var(--pk-warning-bg)',
					bg: 'var(--pk-warning-bg)',
					text: 'var(--pk-warning-text)',
				},
				'pk-error': {
					DEFAULT: 'var(--pk-error)',
					muted: 'var(--pk-error-bg)',
					bg: 'var(--pk-error-bg)',
					text: 'var(--pk-error-text)',
				},
				'pk-info': {
					DEFAULT: 'var(--pk-info)',
					muted: 'var(--pk-info-bg)',
					bg: 'var(--pk-info-bg)',
					text: 'var(--pk-info-text)',
				},
				'pk-indigo': {
					DEFAULT: 'var(--pk-indigo)',
					bg: 'var(--pk-indigo-bg)',
				},

				// Surfaces
				'pk-surface': 'var(--pk-surface)',
				'pk-surface-raised': 'var(--pk-surface-raised)',
				'pk-surface-sunken': 'var(--pk-surface-sunken)',
				'pk-surface-overlay': 'var(--pk-surface-overlay)',

				// Text
				'pk-text-primary': 'var(--pk-text-primary)',
				'pk-text-secondary': 'var(--pk-text-secondary)',
				'pk-text-tertiary': 'var(--pk-text-tertiary)',
				'pk-text-faint': 'var(--pk-text-faint)',
				'pk-text-inverted': 'var(--pk-text-inverted)',

				// Border extras
				'pk-border-soft': 'var(--pk-border-soft)',
				'pk-border-strong': 'var(--pk-border-strong)',
				'pk-border-light': 'var(--pk-border-strong)',       // legacy alias
				'pk-border-accent': 'var(--pk-border-accent)',

				// Skeleton / placeholder
				'pk-skeleton': 'var(--pk-skeleton)',

				// Interaction highlights
				'pk-highlight': 'var(--pk-accent-tint)',            // legacy alias
				'pk-highlight-info': 'var(--pk-highlight-info)',
				'pk-highlight-info-border': 'var(--pk-highlight-info-border)',
			},
			boxShadow: {
				'pk-card': 'var(--pk-shadow-card)',
				'pk-popover': 'var(--pk-shadow-popover)',
				'pk-modal': 'var(--pk-shadow-modal)',
			},
			borderRadius: {
				lg: '0.5rem', // 8px
				md: '0.375rem', // 6px
				sm: '0.25rem', // 4px
				'pk-sm': 'var(--pk-radius-sm)',
				'pk-md': 'var(--pk-radius-md)',
				'pk-lg': 'var(--pk-radius-lg)',
				'pk-xl': 'var(--pk-radius-xl)',
				'pk-full': 'var(--pk-radius-full)',
			},
			fontSize: {
				'pk-xs': 'var(--pk-text-xs)',
				'pk-sm': 'var(--pk-text-sm)',
				'pk-base': 'var(--pk-text-base)',
				'pk-md': 'var(--pk-text-md)',
				'pk-md-plus': 'var(--pk-text-md-plus)',
				'pk-lg': 'var(--pk-text-lg)',
				'pk-lg-plus': 'var(--pk-text-lg-plus)',
				'pk-xl': 'var(--pk-text-xl)',
				'pk-2xl': 'var(--pk-text-2xl)',
				'pk-3xl': 'var(--pk-text-3xl)',
			},
			spacing: {
				'pk-1': 'var(--pk-space-1)',
				'pk-2': 'var(--pk-space-2)',
				'pk-3': 'var(--pk-space-3)',
				'pk-4': 'var(--pk-space-4)',
				'pk-5': 'var(--pk-space-5)',
				'pk-6': 'var(--pk-space-6)',
				'pk-8': 'var(--pk-space-8)',
				'pk-10': 'var(--pk-space-10)',
				'pk-12': 'var(--pk-space-12)',
			},
			zIndex: {
				'pk-base': 'var(--pk-z-base)',
				'pk-sticky': 'var(--pk-z-sticky)',
				'pk-dropdown': 'var(--pk-z-dropdown)',
				'pk-modal': 'var(--pk-z-modal)',
				'pk-popover': 'var(--pk-z-popover)',
				'pk-tooltip': 'var(--pk-z-tooltip)',
			},
			transitionDuration: {
				'pk-fast': '100ms',
				'pk-base': '150ms',
				'pk-slow': '300ms',
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
