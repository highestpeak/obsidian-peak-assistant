/** @type {import('tailwindcss').Config} */
/**
 * Tailwind config for streamdown (scoped isolation)
 *
 * PROBLEM:
 * ========
 * - Streamdown uses Tailwind CSS classes WITHOUT prefix (e.g., `rounded-xl`, `bg-muted/80`)
 * - Our main Tailwind config uses `prefix: 'pktw-'` to avoid conflicts with Obsidian
 * - Without a separate build, streamdown's classes are not generated
 * - This causes code blocks, tables, and other elements to render without proper styling
 *
 * SOLUTION:
 * =========
 * We use a "scoped container" approach:
 *
 * 1. Separate Build:
 *    - Build streamdown styles separately with NO prefix
 *    - Output: `styles.streamdown.css` (scoped utilities)
 *
 * 2. Container Scoping:
 *    - Use `important: '[data-streamdown-root]'` to scope all utilities
 *    - This generates selectors like `[data-streamdown-root] .bg-muted`
 *    - High specificity prevents Obsidian from overriding
 *
 * 3. Theme Tokens:
 *    - Map shadcn-like tokens (muted, border, primary, etc.) to CSS variables
 *    - Variables are defined in `src/styles/streamdown.css`
 *    - We intentionally do NOT map to Obsidian variables
 *
 * 4. Final Assembly:
 *    - `scripts/concat-css.mjs` merges: plugin UI + streamdown + KaTeX CSS
 *    - Output: `styles.css` (single file for Obsidian)
 *
 * USAGE:
 * ======
 * - Build: `npm run build:streamdown`
 * - Output: `styles.streamdown.css` (merged into `styles.css` via `build:css`)
 */
module.exports = {
	content: [
		'./node_modules/streamdown/dist/*.js',
	],
	prefix: '', // No prefix - streamdown requires native Tailwind classes
	/**
	 * Scope streamdown Tailwind utilities under a dedicated root container.
	 *
	 * Why:
	 * - Prevent leaking unprefixed utilities into Obsidian
	 * - Increase specificity so Obsidian global styles are less likely to override streamdown
	 *
	 * Note:
	 * - This is NOT `!important: true`; it prefixes utilities with the selector.
	 */
	important: '[data-streamdown-root]',
	theme: {
		extend: {
			/**
			 * Streamdown uses shadcn-like Tailwind tokens such as:
			 * - bg-muted/80
			 * - text-muted-foreground
			 * - border-border
			 * - bg-background/90
			 *
			 * These classes require named colors to exist in Tailwind theme.
			 * We point them to CSS variables defined in `src/styles/streamdown.css`.
			 *
			 * NOTE: We intentionally do NOT map to Obsidian variables.
			 */
			colors: {
				background: 'hsl(var(--background))',
				foreground: 'hsl(var(--foreground))',
				muted: 'hsl(var(--muted))',
				'muted-foreground': 'hsl(var(--muted-foreground))',
				border: 'hsl(var(--border))',
				input: 'hsl(var(--input))',
				ring: 'hsl(var(--ring))',
				primary: {
					DEFAULT: 'hsl(var(--primary))',
					foreground: 'hsl(var(--primary-foreground))',
				},
				secondary: {
					DEFAULT: 'hsl(var(--secondary))',
					foreground: 'hsl(var(--secondary-foreground))',
				},
				accent: {
					DEFAULT: 'hsl(var(--accent))',
					foreground: 'hsl(var(--accent-foreground))',
				},
				destructive: {
					DEFAULT: 'hsl(var(--destructive))',
					foreground: 'hsl(var(--destructive-foreground))',
				},
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

