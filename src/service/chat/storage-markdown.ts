import { stringifyYaml, TFile, Vault } from 'obsidian';
import matter from 'gray-matter';
import { marked, Tokens } from 'marked';
import { ChatContextWindow, ChatConversationMeta, ChatMessage, ChatProjectContext, ChatProjectMeta } from './types';

interface ParsedFrontmatter<T> {
	data: T;
	body: string;
}

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

export function buildFrontmatter<T extends object>(data: T): string {
	return matter.stringify('', data);
}

export function extractCodeBlock(content: string, codeBlockType: string): string | undefined {
	const tokens = tokenizeMarkdown(content);
	const token = findCodeToken(tokens, codeBlockType);
	return token?.text?.trim();
}

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

export function buildConversationMarkdown(params: {
	meta: ChatConversationMeta;
	context?: ChatContextWindow;
	messages: ChatMessage[];
	bodySections?: string;
}): string {
	const { meta, messages, context, bodySections } = params;
	const frontmatter = buildFrontmatter({
		id: meta.id,
		title: meta.title,
		projectId: meta.projectId ?? null,
		createdAtTimestamp: meta.createdAtTimestamp,
		updatedAtTimestamp: meta.updatedAtTimestamp,
		activeModel: meta.activeModel,
		tokenUsageTotal: meta.tokenUsageTotal ?? 0,
	});

	const sections: string[] = [];
	sections.push('# Conversation Meta');
	sections.push(
		codeBlock('chat-conversation-meta', stringifyYaml({
			...meta,
		}))
	);

	if (context) {
		sections.push('# Conversation Context');
		sections.push(codeBlock('chat-context', stringifyYaml(context)));
	}

	sections.push('# Messages');
	sections.push(messages.map(buildMessageSection).join('\n\n'));

	if (bodySections) {
		sections.push('# Conversation Notes');
		sections.push(bodySections);
	}

	return `${frontmatter}${sections.join('\n\n')}\n`;
}

function buildMessageSection(message: ChatMessage): string {
	const header = `## Message ${message.id}`;
	const metaBlock = codeBlock('chat-message-meta', stringifyYaml({
		id: message.id,
		role: message.role,
		createdAtTimestamp: message.createdAtTimestamp,
		createdAtZone: message.createdAtZone,
		starred: message.starred,
		model: message.model,
		attachments: message.attachments ?? [],
	}));
	const contentBlock = codeBlock('chat-message-content', message.content.trim());
	return `${header}\n${metaBlock}\n\n${contentBlock}`;
}

export function buildProjectMarkdown(params: {
	meta: ChatProjectMeta;
	context?: ChatProjectContext;
	bodySections?: string;
}): string {
	const { meta, context, bodySections } = params;
	const frontmatter = buildFrontmatter(meta);
	const sections: string[] = ['# Project Meta', codeBlock('chat-project', stringifyYaml(meta))];

	if (context) {
		sections.push('# Project Context');
		sections.push(codeBlock('chat-project-context', stringifyYaml(context)));
	}

	if (bodySections) {
		sections.push('# Project Notes');
		sections.push(bodySections);
	}

	return `${frontmatter}${sections.join('\n\n')}\n`;
}

function codeBlock(type: string, content: string): string {
	return `\`\`\`${type}\n${content.trim()}\n\`\`\``;
}

function tokenizeMarkdown(content: string): LexerTokens {
	return marked.lexer(content, { gfm: true });
}

type LexerTokens = ReturnType<typeof marked.lexer>;

function findCodeToken(tokens: Tokens.Generic[] | undefined, lang: string): Tokens.Code | undefined {
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

export async function saveMarkdownFile(vault: Vault, file: TFile | null, path: string, content: string): Promise<TFile> {
	if (file) {
		await vault.modify(file, content);
		return file;
	}
	return vault.create(path, content);
}

