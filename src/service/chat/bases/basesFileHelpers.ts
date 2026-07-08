/**
 * Helpers for the "Save & Open in Bases" affordance on chat `base` code
 * blocks (chat-unified-mode 2026-07-05 follow-up).
 *
 * Bases is a first-party Obsidian view bound to the `.base` file
 * extension — there is no public API to render arbitrary YAML as a Bases
 * view outside a real file. So the plugin cannot inline-render; it can
 * only automate copy → create → open. These helpers own the tiny bit of
 * text munging that both the button and its tests depend on.
 */

const FILENAME_HINT_REGEX = /^\s*#\s*filename\s*:\s*([^\n\r]+)/i;
/** Whitelist for sanitising a filename hint — vault filenames can contain
 *  spaces, but we strip Obsidian-illegal characters and control chars. */
const ILLEGAL_FILENAME_CHARS = /[\\/:*?"<>|\r\n\t]+/g;
const MAX_FILENAME_LENGTH = 80;

export interface BasesTargetName {
	/** Final filename with `.base` extension. */
	fileName: string;
	/** True if the name was derived from a `# filename:` hint in the block. */
	fromHint: boolean;
}

/**
 * Read a filename hint from the first line of a base block. Returns `null`
 * if the first line is not a `# filename: X` comment.
 */
export function parseBasesFilenameHint(source: string): string | null {
	const firstLine = source.split(/\r?\n/, 1)[0] ?? '';
	const match = FILENAME_HINT_REGEX.exec(firstLine);
	if (!match) return null;
	const hint = match[1].trim();
	return hint.length > 0 ? hint : null;
}

/**
 * Return the block text with the `# filename:` hint line removed. If no
 * hint is present, the input is returned unchanged.
 */
export function stripBasesFilenameHint(source: string): string {
	const hint = parseBasesFilenameHint(source);
	if (!hint) return source;
	// Drop the first line + its trailing newline so the resulting YAML
	// starts at `filters:` (or whatever the actual body's first key is).
	const newlineIdx = source.search(/\r?\n/);
	if (newlineIdx < 0) return '';
	const after = newlineIdx + (source[newlineIdx] === '\r' && source[newlineIdx + 1] === '\n' ? 2 : 1);
	return source.slice(after);
}

/**
 * Sanitize a candidate filename into something safe for the vault:
 *   - trim whitespace,
 *   - strip Obsidian-illegal characters (\ / : * ? " < > | plus control chars),
 *   - collapse consecutive spaces,
 *   - clip to a sensible maximum length,
 *   - ensure it ends with `.base`.
 * Returns `null` if the input sanitises to an empty stem.
 */
export function sanitizeBasesFilename(candidate: string): string | null {
	const cleaned = candidate
		.replace(ILLEGAL_FILENAME_CHARS, '')
		.replace(/\s+/g, ' ')
		.trim();
	if (!cleaned) return null;
	const withoutExt = cleaned.toLowerCase().endsWith('.base') ? cleaned.slice(0, -5) : cleaned;
	const clipped = withoutExt.slice(0, MAX_FILENAME_LENGTH);
	if (!clipped.trim()) return null;
	return `${clipped}.base`;
}

function timestampSlug(now: Date): string {
	const pad = (n: number) => String(n).padStart(2, '0');
	return (
		`${now.getFullYear()}${pad(now.getMonth() + 1)}${pad(now.getDate())}` +
		`-${pad(now.getHours())}${pad(now.getMinutes())}${pad(now.getSeconds())}`
	);
}

/**
 * Resolve the target filename for a base block, preferring the model's
 * `# filename:` hint and falling back to a timestamped name. Never
 * throws — an unusable hint falls through to the timestamp.
 */
export function resolveBasesTargetName(source: string, now: Date = new Date()): BasesTargetName {
	const hint = parseBasesFilenameHint(source);
	if (hint) {
		const sanitized = sanitizeBasesFilename(hint);
		if (sanitized) return { fileName: sanitized, fromHint: true };
	}
	return { fileName: `bases-${timestampSlug(now)}.base`, fromHint: false };
}
