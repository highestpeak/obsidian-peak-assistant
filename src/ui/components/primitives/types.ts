/**
 * Shared types for design-system primitives.
 *
 * `ProviderId` enumerates the six providers whose brand colors are bound in
 * `peak-tokens.css` via `--pk-prov-*` tokens. Both `<Chip variant="provider">`
 * and `<BrandAvatar>` consume this union so adding a new provider is a
 * one-line change here plus matching tokens.
 */
export type ProviderId =
	| 'openai'
	| 'anthropic'
	| 'google'
	| 'openrouter'
	| 'perplexity'
	| 'ollama';
