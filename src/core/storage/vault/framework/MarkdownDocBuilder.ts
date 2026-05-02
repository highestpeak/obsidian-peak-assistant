/**
 * MarkdownDocBuilder — fluent API for constructing markdown documents.
 *
 * Replaces the `lines: string[] = []; lines.push(...); lines.join('\n')` pattern
 * used across all vault doc builders.
 *
 * Usage:
 *   const md = new MarkdownDocBuilder()
 *     .frontmatter({ type: 'ai-graph', query: 'test' })
 *     .heading(1, 'Summary')
 *     .text('This is the summary.')
 *     .blankLine()
 *     .heading(1, 'Sources')
 *     .wikilinks(['file1.md', 'file2.md'])
 *     .build();
 */

import { buildFrontmatter } from '@/core/utils/markdown-utils';

export class MarkdownDocBuilder {
	private parts: string[] = [];

	/** Add YAML frontmatter block. Must be called first (before any other content). */
	frontmatter(fields: Record<string, unknown>): this {
		const fm = buildFrontmatter(fields).trim();
		this.parts.push(fm);
		return this;
	}

	/** Add raw YAML frontmatter lines (for cases where field order matters or values need custom escaping). */
	frontmatterRaw(fields: Array<[key: string, value: string | number | boolean | undefined | null]>): this {
		const lines = ['---'];
		for (const [key, value] of fields) {
			if (value === undefined || value === null) continue;
			lines.push(`${key}: ${value}`);
		}
		lines.push('---');
		this.parts.push(lines.join('\n'));
		return this;
	}

	/** Add a heading at the given level (1–6). */
	heading(level: number, text: string): this {
		this.parts.push('#'.repeat(level) + ' ' + text);
		return this;
	}

	/** Add raw text content. */
	text(content: string): this {
		this.parts.push(content);
		return this;
	}

	/** Add an empty line (section separator). */
	blankLine(): this {
		this.parts.push('');
		return this;
	}

	/** Add a fenced code block with optional language. */
	codeBlock(lang: string, code: string): this {
		this.parts.push('```' + lang);
		this.parts.push(code);
		this.parts.push('```');
		return this;
	}

	/** Add a JSON code block. */
	json(data: unknown, indent = 2): this {
		return this.codeBlock('json', JSON.stringify(data, null, indent));
	}

	/** Add a mermaid diagram block. */
	mermaid(code: string): this {
		return this.codeBlock('mermaid', code);
	}

	/** Add a bullet list. */
	list(items: string[]): this {
		for (const item of items) this.parts.push(`- ${item}`);
		return this;
	}

	/** Add a numbered list. */
	numberedList(items: string[]): this {
		items.forEach((item, i) => this.parts.push(`${i + 1}. ${item}`));
		return this;
	}

	/** Add wikilinks as a bullet list. */
	wikilinks(paths: string[]): this {
		for (const p of paths) this.parts.push(`- [[${p}]]`);
		return this;
	}

	/** Add an Obsidian callout block. */
	callout(type: string, title: string, content: string, collapsed = false): this {
		const marker = collapsed ? '-' : '';
		this.parts.push(`> [!${type}]${marker} ${title}`);
		for (const line of content.split('\n')) {
			this.parts.push(line ? `> ${line}` : '>');
		}
		return this;
	}

	/**
	 * Add a section: heading + body + trailing blank line.
	 * Body can be a string or a callback that receives a sub-builder.
	 */
	section(level: 1 | 2 | 3 | 4 | 5 | 6, title: string, body: string | ((b: MarkdownDocBuilder) => void)): this {
		this.heading(level, title);
		if (typeof body === 'string') {
			if (body.trim()) this.text(body);
		} else {
			const sub = new MarkdownDocBuilder();
			body(sub);
			const built = sub.buildInner();
			if (built.trim()) this.text(built);
		}
		this.blankLine();
		return this;
	}

	/** Add raw content (escape hatch). */
	raw(text: string): this {
		this.parts.push(text);
		return this;
	}

	/** Build the final markdown string (trimmed, with trailing newline). */
	build(): string {
		return this.parts.join('\n').trim() + '\n';
	}

	/** Build inner content (no trailing newline, for nesting). */
	private buildInner(): string {
		return this.parts.join('\n');
	}
}
