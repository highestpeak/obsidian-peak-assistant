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
				background: 'var(--pk-bg, var(--background-primary, #ffffff))',
				card: 'var(--pk-surface, var(--background-secondary, var(--background-primary, #ffffff)))',
				popover: {
					DEFAULT: 'var(--pk-popover, var(--background-primary, #ffffff))',
					foreground: 'var(--pk-text-primary, var(--text-normal, #2e3338))',
				},
				// Text colors
				foreground: 'var(--pk-fg, var(--text-normal, #2e3338))',
				// Primary colors
				primary: {
					DEFAULT: 'var(--pk-info, var(--interactive-accent, #3b82f6))',
					foreground: 'var(--pk-text-inverted, var(--text-on-accent, #ffffff))',
				},
				// Secondary colors
				secondary: {
					DEFAULT: 'var(--pk-surface-sunken, var(--background-secondary, #f3f4f6))',
					foreground: 'var(--pk-text-primary, var(--text-normal, #2e3338))',
				},
				// Muted colors
				muted: {
					DEFAULT: 'var(--pk-surface-sunken, var(--background-secondary, #f3f4f6))',
					foreground: 'var(--pk-text-secondary, var(--text-muted, #6c757d))',
				},
				// Accent colors
				accent: {
					DEFAULT: 'var(--pk-accent, var(--interactive-accent, #7c3aed))',
					foreground: 'var(--pk-accent-fg, var(--text-on-accent, #ffffff))',
				},
				// Destructive colors
				destructive: {
					DEFAULT: 'var(--pk-error, #ef4444)',
					foreground: 'var(--pk-text-inverted, #ffffff)',
				},
				// Border colors
				border: 'var(--pk-border, rgba(128, 128, 128, 0.15))',
				'border-default': 'var(--pk-border, var(--background-modifier-border, rgba(128, 128, 128, 0.15)))',
				'border-hover': 'var(--pk-info, var(--interactive-accent, #3b82f6))',
				input: 'var(--pk-border, rgba(128, 128, 128, 0.2))',
				ring: 'var(--pk-info, var(--interactive-accent, #3b82f6))',

				// ── Peak CSS variable colors (Obsidian-aware + dark-mode-safe) ──
				// Structural (Obsidian-aware)
				'pk-background': 'var(--pk-bg, var(--background-primary, #ffffff))',
				'pk-background-secondary': 'var(--pk-bg-secondary, var(--background-secondary, #f3f4f6))',
				'pk-foreground': 'var(--pk-fg, var(--text-normal, #2e3338))',
				'pk-foreground-muted': 'var(--pk-fg-muted, var(--text-muted, #6c757d))',
				'pk-foreground-faint': 'var(--pk-fg-faint, var(--text-faint, #999999))',
				'pk-border': 'var(--pk-border, var(--background-modifier-border, rgba(128, 128, 128, 0.15)))',

				// Brand
				'pk-accent': {
					DEFAULT: 'var(--pk-accent, var(--interactive-accent, #7c3aed))',
					hover: 'var(--pk-accent-hover, var(--interactive-accent-hover, #6d28d9))',
					muted: 'var(--pk-accent-muted, rgba(124, 58, 237, 0.15))',
					fg: 'var(--pk-accent-fg, var(--text-on-accent, #ffffff))',
				},

				// Semantic
				'pk-success': { DEFAULT: 'var(--pk-success, #22c55e)', muted: 'var(--pk-success-muted, rgba(34, 197, 94, 0.12))' },
				'pk-warning': { DEFAULT: 'var(--pk-warning, #f59e0b)', muted: 'var(--pk-warning-muted, rgba(245, 158, 11, 0.12))' },
				'pk-error': { DEFAULT: 'var(--pk-error, #ef4444)', muted: 'var(--pk-error-muted, rgba(239, 68, 68, 0.12))' },
				'pk-info': { DEFAULT: 'var(--pk-info, #3b82f6)', muted: 'var(--pk-info-muted, rgba(59, 130, 246, 0.12))' },

				// Surfaces (theme-aware opaque backgrounds)
				'pk-surface': 'var(--pk-surface, var(--background-primary, #ffffff))',
				'pk-surface-raised': 'var(--pk-surface-raised, var(--background-primary, #fafafa))',
				'pk-surface-sunken': 'var(--pk-surface-sunken, var(--background-secondary, #f3f4f6))',
				'pk-surface-overlay': 'var(--pk-surface-overlay, var(--background-primary, #ffffff))',

				// Text (theme-aware opaque text colors)
				'pk-text-primary': 'var(--pk-text-primary, var(--text-normal, #2e3338))',
				'pk-text-secondary': 'var(--pk-text-secondary, var(--text-muted, #6c757d))',
				'pk-text-tertiary': 'var(--pk-text-tertiary, var(--text-faint, #999999))',
				'pk-text-inverted': 'var(--pk-text-inverted, var(--text-on-accent, #ffffff))',

				// Border extras
				'pk-border-light': 'var(--pk-border-light, var(--background-modifier-border, #d1d5db))',
				'pk-border-accent': 'var(--pk-border-accent, rgba(124, 58, 237, 0.25))',

				// Skeleton / placeholder
				'pk-skeleton': 'var(--pk-skeleton, #e5e7eb)',

				// Interaction highlights
				'pk-highlight': 'var(--pk-highlight, var(--background-modifier-hover, #f5f3ff))',
				'pk-highlight-info': 'var(--pk-highlight-info, #eff6ff)',
				'pk-highlight-info-border': 'var(--pk-highlight-info-border, #93c5fd)',
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
