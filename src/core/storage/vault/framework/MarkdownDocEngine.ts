/**
 * MarkdownDocEngine — generic markdown document operations.
 *
 * Provides reusable, side-effect-free helpers for frontmatter parsing/updating
 * and named-section extraction/replacement. Domain-specific parsing (mermaid,
 * emoji messages, JSON blocks, etc.) stays in each doc module.
 */

export {
	parseFrontmatter,
	mergeYamlFrontmatter as updateFrontmatter,
} from '@/core/utils/markdown-utils';

/**
 * Extract the text content of a named section (# SectionName, ## SectionName, or ### SectionName).
 * Returns empty string if section not found.
 */
export function extractSection(markdown: string, sectionTitle: string): string {
	const escapeRegExp = (s: string) => s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
	const pattern = new RegExp(`^#{1,3}\\s+${escapeRegExp(sectionTitle)}\\s*$`, 'm');
	const m = pattern.exec(markdown);
	if (!m) return '';
	const start = m.index + m[0].length;
	const after = markdown.slice(start);
	const nextSectionStart = after.search(/\n#\s+\S/);
	const end = nextSectionStart >= 0 ? nextSectionStart : after.length;
	return after.slice(0, end).trim();
}

/**
 * Replace the content of a named H1 section, preserving everything else.
 * The section is identified by "# SectionTitle\n\n" and ends at the next "# ".
 * Returns original markdown unchanged if section not found or next section not found.
 */
export function updateSection(
	markdown: string,
	sectionTitle: string,
	newContent: string,
	nextSectionTitle: string,
): string {
	const head = `# ${sectionTitle}\n\n`;
	const next = `\n# ${nextSectionTitle}`;
	const i = markdown.indexOf(head);
	if (i < 0) return markdown;
	const start = i + head.length;
	const j = markdown.indexOf(next, start);
	if (j < 0) return markdown;
	const trimmed = newContent.trim();
	return markdown.slice(0, start) + trimmed + markdown.slice(j);
}
