export interface PromptTriggerMatch {
	trigger: '@' | '[[' | '/';
	query: string;
	/** Absolute offset of the trigger start (including the trigger token). */
	from: number;
	/** Absolute offset of the cursor at the end of the live query. */
	to: number;
}

/**
 * Pure trigger parser shared by every PromptInput consumer.
 *
 * `@` only activates at a word boundary so ordinary email addresses remain
 * prose. `/` is intentionally restricted to the beginning of the first line.
 */
export function detectPromptTrigger(
	docText: string,
	cursorPos: number,
): PromptTriggerMatch | null {
	const lookback = 200;
	const start = Math.max(0, cursorPos - lookback);
	const textBefore = docText.slice(start, cursorPos);

	const bracketIdx = textBefore.lastIndexOf('[[');
	if (bracketIdx >= 0) {
		const afterBracket = textBefore.slice(bracketIdx + 2);
		if (!afterBracket.includes(']]') && !afterBracket.includes('\n')) {
			return {
				trigger: '[[',
				query: afterBracket,
				from: start + bracketIdx,
				to: cursorPos,
			};
		}
	}

	const mentionIdx = textBefore.lastIndexOf('@');
	if (mentionIdx >= 0) {
		const beforeMention = textBefore[mentionIdx - 1];
		const afterMention = textBefore.slice(mentionIdx + 1);
		const boundary = mentionIdx === 0 || /\s/.test(beforeMention);
		if (boundary && !/\s/.test(afterMention)) {
			return {
				trigger: '@',
				query: afterMention,
				from: start + mentionIdx,
				to: cursorPos,
			};
		}
	}

	if (docText.startsWith('/') && cursorPos <= docText.length) {
		const firstLineEnd = docText.indexOf('\n');
		const lineEnd = firstLineEnd === -1 ? docText.length : firstLineEnd;
		if (cursorPos >= 1 && cursorPos <= lineEnd) {
			const query = docText.slice(1, cursorPos);
			if (!query.includes(' ')) {
				return { trigger: '/', query, from: 0, to: cursorPos };
			}
		}
	}

	return null;
}
