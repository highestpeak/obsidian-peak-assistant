import matter from 'gray-matter';
import { marked, Tokens } from 'marked';

/**
 * Best-effort markdown extractors and utilities for search signals.
 *
 * These are intentionally simple for MVP and should remain pure functions.
 */

/**
 * Parsed frontmatter result
 */
export interface ParsedFrontmatter<T> {
	data: T;
	body: string;
}

/**
 * Extracts all unique wiki links ([[Link]] or [[Link|Alias]]) from the given markdown content.
 * 
 * @param content The markdown content string.
 * @returns An array of wiki link targets in source order.
 *
 * @example
 *   extractWikiLinks("See [[Home]], [[About Us|About]], and [[Contact]].");
 *   // => ["Home", "About Us", "Contact"]
 */
export function extractWikiLinks(content: string): string[] {
	const out: string[] = [];
	const re = /\[\[([^\]]+)\]\]/g;
	let m: RegExpExecArray | null;
	while ((m = re.exec(content))) {
		const raw = (m[1] ?? '').trim();
		if (!raw) continue;
		// Strip alias part: [[target|alias]]
		const target = raw.split('|')[0].trim();
		if (target) out.push(target);
	}
	return out;
}

/**
 * Extracts all unique hashtags (e.g. #tag) from the given markdown content.
 * Ignores code blocks for MVP.
 * 
 * @param content The markdown content string.
 * @returns An array of unique tags found, in order of their first occurrence.
 *
 * @example
 *   extractTags("Here is a #todo item and another #item/sub. Also #unique_tag!");
 *   // => ["todo", "item/sub", "unique_tag"]
 */
export function extractTags(content: string): string[] {
	// MVP: naive hashtag extraction (ignore code blocks for now).
	const out = new Set<string>();
	const re = /(^|\s)#([\p{L}0-9_\-\/]+)/gu;
	let m: RegExpExecArray | null;
	while ((m = re.exec(content))) {
		const tag = (m[2] ?? '').trim();
		if (tag) out.add(tag);
	}
	return Array.from(out);
}

/**
 * Parse frontmatter from markdown content.
 * 
 * @param text The markdown content with frontmatter.
 * @returns Parsed frontmatter data and body, or null if no frontmatter found.
 */
export function parseFrontmatter<T extends object>(text: string): ParsedFrontmatter<T> | null {
	const parsed = matter(text);
	if (parsed.matter === '') {
		return null;
	}

	return {
		data: parsed.data as T,
		body: parsed.content,
	};
}

/**
 * Build frontmatter string from data object.
 * 
 * @param data The data object to serialize as frontmatter.
 * @returns Frontmatter string (without body content).
 */
export function buildFrontmatter<T extends object>(data: T): string {
	return matter.stringify('', data);
}

/**
 * Extract content from a code block of the specified type.
 * 
 * @param content The markdown content.
 * @param codeBlockType The language/type of code block to find.
 * @returns The code block content, or undefined if not found.
 */
export function extractCodeBlock(content: string, codeBlockType: string): string | undefined {
	const tokens = tokenizeMarkdown(content);
	const token = findCodeToken(tokens, codeBlockType);
	return token?.text?.trim();
}

/**
 * Replace an existing code block or append a new one.
 * 
 * @param content The markdown content.
 * @param codeBlockType The language/type of code block.
 * @param nextBlock The new code block content.
 * @returns Updated markdown content.
 */
export function replaceOrAppendCodeBlock(content: string, codeBlockType: string, nextBlock: string): string {
	const tokens = tokenizeMarkdown(content);
	const nextBlockTrimmed = nextBlock.trim();
	const block = codeBlock(codeBlockType, nextBlockTrimmed);
	const token = findCodeToken(tokens, codeBlockType);

	if (token && token.raw) {
		return content.replace(token.raw, block);
	}

	const trimmed = content.trimEnd();
	const separator = trimmed.length > 0 ? '\n\n' : '';
	return `${trimmed}${separator}${block}\n`;
}

/**
 * Create a markdown code block string.
 * 
 * @param type The code block language/type.
 * @param content The code block content.
 * @returns Formatted code block string.
 */
export function codeBlock(type: string, content: string): string {
	return `\`\`\`${type}\n${content.trim()}\n\`\`\``;
}

/**
 * Tokenize markdown content using marked lexer.
 * 
 * @param content The markdown content to tokenize.
 * @returns Array of markdown tokens.
 */
export function tokenizeMarkdown(content: string): LexerTokens {
	return marked.lexer(content, { gfm: true });
}

type LexerTokens = ReturnType<typeof marked.lexer>;

/**
 * Find a code token of the specified language in the token tree.
 * 
 * @param tokens The markdown tokens to search.
 * @param lang The language/type to find.
 * @returns The code token if found, undefined otherwise.
 */
export function findCodeToken(tokens: Tokens.Generic[] | undefined, lang: string): Tokens.Code | undefined {
	if (!tokens) return undefined;

	for (const token of tokens) {
		if (token.type === 'code' && token.lang === lang) {
			return token as Tokens.Code;
		}

		if (isListToken(token)) {
			for (const item of token.items ?? []) {
				const found = findCodeToken(item.tokens ?? [], lang);
				if (found) return found;
			}
		}

		if (hasNestedTokens(token)) {
			const found = findCodeToken(token.tokens ?? [], lang);
			if (found) return found;
		}
	}
	return undefined;
}

function isListToken(token: Tokens.Generic): token is Tokens.List {
	return token.type === 'list';
}

function hasNestedTokens(token: Tokens.Generic): token is Tokens.Generic & { tokens: Tokens.Generic[] } {
	return Array.isArray((token as any).tokens);
}

