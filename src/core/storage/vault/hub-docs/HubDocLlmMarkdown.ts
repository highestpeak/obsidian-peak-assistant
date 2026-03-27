/**
 * HubDoc markdown helpers: strip frontmatter for LLM context and apply structured LLM fill to section bodies.
 */

import type { HubDocSummaryLlm } from '@/core/schemas/hubDiscoverLlm';
import { parseFrontmatter } from '@/core/utils/markdown-utils';

/**
 * Body after YAML frontmatter for prompt size control; returns full string when no frontmatter.
 */
export function hubDocMarkdownBodyForLlm(markdown: string): string {
	const parsed = parseFrontmatter<Record<string, unknown>>(markdown);
	return parsed ? parsed.body : markdown;
}

function replaceMarkdownH2Section(markdown: string, title: string, body: string, nextTitle: string): string {
	const head = `# ${title}\n\n`;
	const next = `\n# ${nextTitle}`;
	const i = markdown.indexOf(head);
	if (i < 0) return markdown;
	const start = i + head.length;
	const j = markdown.indexOf(next, start);
	if (j < 0) return markdown;
	const trimmed = body.trim();
	return markdown.slice(0, start) + trimmed + markdown.slice(j);
}

function formatNumberedFacts(facts: string[]): string {
	if (!facts.length) return '_No facts extracted._';
	return facts
		.map((f, idx) => `${idx + 1}. ${f.trim()}`)
		.join('\n');
}

function formatBulletAnchors(phrases: string[]): string {
	if (!phrases.length) return '_None._';
	return phrases.map((p) => `- ${p.trim()}`).join('\n');
}

/**
 * Merge validated LLM fields into the hub skeleton (keeps frontmatter and Mermaid block unchanged).
 */
export function applyHubDocLlmPayloadToMarkdown(markdown: string, p: HubDocSummaryLlm): string {
	let out = markdown;
	out = replaceMarkdownH2Section(out, 'Short Summary', p.shortSummary, 'Full Summary');
	out = replaceMarkdownH2Section(out, 'Full Summary', p.fullSummary, 'Topology Routes');
	let coreBlock = formatNumberedFacts(p.coreFacts);
	if (p.keyPatterns?.trim()) {
		coreBlock += `\n\n**Key patterns**\n\n${p.keyPatterns.trim()}`;
	}
	out = replaceMarkdownH2Section(out, 'Core Facts', coreBlock, 'Tag / Topic Distribution');
	out = replaceMarkdownH2Section(out, 'Tag / Topic Distribution', p.tagTopicDistribution, 'Time Dimension');
	out = replaceMarkdownH2Section(out, 'Time Dimension', p.timeDimension, 'Mermaid');
	out = replaceMarkdownH2Section(out, 'Query Anchors', formatBulletAnchors(p.queryAnchors), 'Source scope');
	return out;
}
