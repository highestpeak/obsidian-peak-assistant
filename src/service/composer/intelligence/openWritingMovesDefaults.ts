/**
 * Fallback syntax contract for the deterministic open-writing-moves producer.
 *
 * The active expression lives in `templates/config/composer.json#sidecar`.
 * This file only keeps the runtime usable while TemplateManager is unavailable
 * or a user-edited template contains an invalid expression.
 */
export const DEFAULT_UNCHECKED_TASK_PATTERN_SOURCE =
	'^\\s*(?:[-*+]|\\d+[.)])\\s+\\[ \\]\\s+';

/** Compile the template-owned source matcher without allowing a bad template to break a document view. */
export function compileUncheckedTaskPattern(source: string): RegExp {
	try {
		return new RegExp(source);
	} catch {
		return new RegExp(DEFAULT_UNCHECKED_TASK_PATTERN_SOURCE);
	}
}
