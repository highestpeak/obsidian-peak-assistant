import type { ChatMessage, ChatResourceRef } from '@/service/chat/types';
import { hashMD5 } from '@/core/utils/hash-utils';
import {
	normalizeLine,
	splitSections,
	extractWikilinks,
	rebaseHeadings,
	fixUnclosedCodeBlocks,
} from '@/core/storage/vault/framework/MarkdownDocEngine';
import { MarkdownDocBuilder } from '@/core/storage/vault/framework/MarkdownDocBuilder';

// ── Constants ───────────────────────────────────────────────────────────────

const SECTION_ATTACHMENTS = 'Attachments';
const SECTION_SHORT_SUMMARY = 'Short Summary';
const SECTION_FULL_SUMMARY = 'Full Summary';
const SECTION_NO_TOPIC = 'NoTopic';

/** Pre-compiled regex for code blocks with optional language specifier */
const REGEX_CODEBLOCK = /```(?:json|javascript|js)?\n?([\s\S]*?)```/g;

// ── Types ───────────────────────────────────────────────────────────────────

/**
 * Message in document format (plain text representation).
 */
export interface ChatMessageDoc {
	role: 'user' | 'assistant' | 'system';
	content: string;
	title?: string;
	reasoning?: { content: string };
	toolCalls?: Array<{ toolName: string; input?: any; output?: any; isActive?: boolean }>;
}

/**
 * Topic section in conversation document.
 * Topic acts as a separator/grouping for messages.
 */
export interface ChatConversationTopicDoc {
	title: string;
	summary?: string;
	messages: Array<ChatMessageDoc>;
}

export interface ChatConversationDocModel {
	attachments: string[];
	shortSummary: string;
	fullSummary: string;
	topics: ChatConversationTopicDoc[];
	messages: Array<ChatMessageDoc>;
}

// ── Helpers ─────────────────────────────────────────────────────────────────

function isMessageTitle(title: string): boolean {
	return title.startsWith('💬') || title.startsWith('🤖');
}

function parseMessageRole(title: string): 'user' | 'assistant' {
	return title.startsWith('💬') ? 'user' : 'assistant';
}

function parseMessageShortTitle(title: string): string | undefined {
	const m = title.match(/^(?:💬|🤖)\s+(.+)$/);
	return m ? m[1] : undefined;
}

// ── Main class ──────────────────────────────────────────────────────────────

export class ChatConversationDoc {

	// ── Message key (for deduplication) ──────────────────────────────────────

	static createMessageKey(msg: ChatMessageDoc): string;
	static createMessageKey(role: string, content: string, title?: string): string;
	static createMessageKey(msgOrRole: ChatMessageDoc | string, content?: string, title?: string): string {
		if (typeof msgOrRole === 'string') {
			return `${msgOrRole}|${hashMD5(content!)}|${title || ''}`;
		}
		return `${msgOrRole.role}|${hashMD5(msgOrRole.content)}|${msgOrRole.title || ''}`;
	}

	// ── Render ──────────────────────────────────────────────────────────────

	/**
	 * Build conversation markdown (plain text, no meta).
	 */
	static buildMarkdown(params: {
		docModel: ChatConversationDocModel;
		attachments?: ChatResourceRef[];
	}): string {
		const { docModel, attachments: providedAttachments = [] } = params;

		const allAttachments = new Map<string, ChatResourceRef>();
		for (const source of docModel.attachments) {
			allAttachments.set(source, { source } as ChatResourceRef);
		}
		for (const att of providedAttachments) {
			allAttachments.set(att.source, att);
		}

		return this.render(docModel, Array.from(allAttachments.values()));
	}

	private static render(
		docModel: ChatConversationDocModel,
		attachments: ChatResourceRef[],
	): string {
		const b = new MarkdownDocBuilder();

		if (attachments.length > 0) {
			b.heading(1, SECTION_ATTACHMENTS);
			b.wikilinks(attachments.map((a) => a.source));
			b.blankLine();
		}

		if (docModel.shortSummary) {
			b.heading(1, SECTION_SHORT_SUMMARY);
			b.text(docModel.shortSummary);
			b.blankLine();
		}
		if (docModel.fullSummary) {
			b.heading(1, SECTION_FULL_SUMMARY);
			b.text(docModel.fullSummary);
			b.blankLine();
		}

		for (const topic of docModel.topics) {
			b.heading(1, topic.title);
			b.blankLine();
			if (topic.summary) {
				b.text(topic.summary);
				b.blankLine();
			}
			for (const msg of topic.messages) {
				this.renderMessage(b, msg);
			}
		}

		if (docModel.messages.length > 0) {
			b.heading(1, SECTION_NO_TOPIC);
			b.blankLine();
			for (const msg of docModel.messages) {
				this.renderMessage(b, msg);
			}
		}

		return b.build();
	}

	private static renderMessage(b: MarkdownDocBuilder, msg: ChatMessageDoc): void {
		if (msg.role !== 'user' && msg.role !== 'assistant') return;

		const emoji = msg.role === 'user' ? '💬' : '🤖';
		const shortTitle = (msg.title ?? '').trim();
		const header = shortTitle ? `${emoji} ${shortTitle}` : emoji;

		let content = msg.content;
		if (this.needsNormalization(content, msg.role)) {
			content = rebaseHeadings(content, 2);
		}
		content = fixUnclosedCodeBlocks(content);

		b.heading(1, header);
		b.text(content);
		b.blankLine();
	}

	/**
	 * Check if message content starts with level 1 heading.
	 */
	private static needsNormalization(content: string, role: string): boolean {
		if (role !== 'user' && role !== 'assistant') return false;
		const trimmed = content.trim();
		if (!trimmed) return false;
		for (const line of trimmed.split('\n')) {
			const tl = line.trim();
			if (!tl) continue;
			return tl.startsWith('# ') && !tl.startsWith('## ');
		}
		return false;
	}

	/**
	 * Normalize content to ensure it starts with level 2 heading or below.
	 * Public for use by ChatStore when appending messages.
	 */
	static normalizeContentLevel(content: string, role: ChatMessageDoc['role']): string {
		if (role !== 'user' && role !== 'assistant') return content;
		if (!this.needsNormalization(content, role)) return content;
		return rebaseHeadings(content, 2);
	}

	// ── Parse ───────────────────────────────────────────────────────────────

	/**
	 * Parse conversation markdown to extract summary, topics, messages and attachments.
	 */
	static parse(raw: string): ChatConversationDocModel {
		const md = normalizeLine(raw);
		const sections = splitSections(md, 1);

		const attachments: string[] = [];
		let shortSummary = '';
		let fullSummary = '';
		const topics: ChatConversationTopicDoc[] = [];
		const messages: ChatMessageDoc[] = [];
		let currentTopic: ChatConversationTopicDoc | null = null;

		for (const sec of sections) {
			if (sec.title === SECTION_ATTACHMENTS) {
				attachments.push(...extractWikilinks(sec.body));
			} else if (sec.title === SECTION_SHORT_SUMMARY) {
				shortSummary = sec.body.trim();
			} else if (sec.title === SECTION_FULL_SUMMARY) {
				fullSummary = sec.body.trim();
			} else if (isMessageTitle(sec.title)) {
				const msg = this.parseMessageSection(sec.title, sec.body);
				if (msg) {
					if (currentTopic) {
						currentTopic.messages.push(msg);
					} else {
						messages.push(msg);
					}
				}
			} else if (sec.title === SECTION_NO_TOPIC) {
				if (currentTopic) {
					topics.push(currentTopic);
					currentTopic = null;
				}
			} else {
				// Topic header
				if (currentTopic) topics.push(currentTopic);
				currentTopic = {
					title: sec.title,
					summary: sec.body.trim() || undefined,
					messages: [],
				};
			}
		}
		if (currentTopic) topics.push(currentTopic);

		return { attachments, shortSummary, fullSummary, topics, messages };
	}

	private static parseMessageSection(headerTitle: string, body: string): ChatMessageDoc | null {
		const trimmedBody = body.trim();
		if (!trimmedBody) return null;

		const role = parseMessageRole(headerTitle);
		const title = parseMessageShortTitle(headerTitle);
		const { mainContent, reasoning, toolCalls } = this.parseReasoningAndTools(trimmedBody);

		return { role, content: mainContent, title, reasoning, toolCalls };
	}

	private static parseReasoningAndTools(content: string): {
		mainContent: string;
		reasoning?: { content: string };
		toolCalls?: Array<{ toolName: string; input?: any; output?: any; isActive?: boolean }>;
	} {
		const h2Sections = splitSections(content, 2);
		if (h2Sections.length === 0) return { mainContent: content };

		let reasoning: { content: string } | undefined;
		let toolCalls: Array<{ toolName: string; input?: any; output?: any; isActive?: boolean }> | undefined;
		const processedParts: string[] = [];

		// Text before first ## heading
		const firstH2Regex = /^## /m;
		const firstH2Match = firstH2Regex.exec(content);
		if (firstH2Match && firstH2Match.index > 0) {
			const preamble = content.slice(0, firstH2Match.index).trim();
			if (preamble) processedParts.push(preamble);
		}

		for (const sec of h2Sections) {
			const heading = sec.title.toLowerCase();
			if (heading.includes('reasoning') || heading.includes('thinking')) {
				const reasoningContent = sec.body.trim();
				if (reasoningContent) reasoning = { content: reasoningContent };
			} else if (heading.includes('tool') || heading.includes('function')) {
				toolCalls = this.parseToolCallsFromContent(sec.body);
			} else {
				processedParts.push(`## ${sec.title}\n${sec.body}`);
			}
		}

		const mainContent = processedParts.length > 0 ? processedParts.join('\n\n').trim() : content;
		return { mainContent, reasoning, toolCalls };
	}

	private static parseToolCallsFromContent(content: string): Array<{ toolName: string; input?: any; output?: any; isActive?: boolean }> {
		const toolCalls: Array<{ toolName: string; input?: any; output?: any; isActive?: boolean }> = [];
		let match;

		REGEX_CODEBLOCK.lastIndex = 0;
		while ((match = REGEX_CODEBLOCK.exec(content)) !== null) {
			const codeContent = match[1].trim();
			try {
				const parsed = JSON.parse(codeContent);
				if (Array.isArray(parsed)) {
					for (const call of parsed) {
						if (call.toolName || call.name) {
							toolCalls.push({
								toolName: call.toolName || call.name,
								input: call.input || call.arguments,
								output: call.output || call.result,
								isActive: call.isActive || false,
							});
						}
					}
				} else if (parsed.toolName || parsed.name) {
					toolCalls.push({
						toolName: parsed.toolName || parsed.name,
						input: parsed.input || parsed.arguments,
						output: parsed.output || parsed.result,
						isActive: parsed.isActive || false,
					});
				}
			} catch {
				const lines = codeContent.split('\n').filter((line: string) => line.trim());
				for (const line of lines) {
					try {
						const parsed = JSON.parse(line.trim());
						if (parsed.toolName || parsed.name) {
							toolCalls.push({
								toolName: parsed.toolName || parsed.name,
								input: parsed.input || parsed.arguments,
								output: parsed.output || parsed.result,
								isActive: parsed.isActive || false,
							});
						}
					} catch {
						// Skip invalid lines
					}
				}
			}
		}
		return toolCalls;
	}

	// ── Append (parse -> merge -> re-render) ─────────────────────────────────

	/**
	 * Append content to existing conversation markdown.
	 * Strategy: Parse existing content, merge with new content, then re-render.
	 */
	static appendMessagesToContent(
		currentContent: string,
		params: {
			topics?: ChatConversationTopicDoc[];
			messages?: ChatMessage[];
			attachments?: ChatResourceRef[];
		},
	): string {
		const { messages = [], topics: newTopics = [], attachments: newAttachments = [] } = params;

		if (messages.length === 0 && newTopics.length === 0 && newAttachments.length === 0) {
			return currentContent;
		}

		const docModel = this.parse(currentContent);
		const allAttachments = this.collectAttachments(docModel, messages, newAttachments);
		const newMessagesDoc = this.convertMessagesToDoc(messages);
		const { topics: allTopics, messages: allMessages } = this.mergeTopicsAndMessages(
			docModel,
			newTopics,
			newMessagesDoc,
		);

		return this.buildMarkdown({
			docModel: { ...docModel, topics: allTopics, messages: allMessages },
			attachments: Array.from(allAttachments.values()),
		});
	}

	private static collectAttachments(
		docModel: ChatConversationDocModel,
		messages: ChatMessage[],
		newAttachments: ChatResourceRef[],
	): Map<string, ChatResourceRef> {
		const all = new Map<string, ChatResourceRef>();
		for (const source of docModel.attachments) {
			all.set(source, { source } as ChatResourceRef);
		}
		for (const msg of messages) {
			if (msg.resources) {
				for (const res of msg.resources) {
					all.set(res.source, res as ChatResourceRef);
				}
			}
		}
		for (const att of newAttachments) {
			all.set(att.source, att);
		}
		return all;
	}

	private static convertMessagesToDoc(messages: ChatMessage[]): ChatMessageDoc[] {
		return messages
			.filter((msg) => msg.role === 'user' || msg.role === 'assistant')
			.map((msg) => ({
				role: msg.role as 'user' | 'assistant',
				content: msg.content,
				title: msg.title,
			}));
	}

	private static mergeTopicsAndMessages(
		docModel: ChatConversationDocModel,
		newTopics: ChatConversationTopicDoc[],
		newMessagesDoc: ChatMessageDoc[],
	): { topics: ChatConversationTopicDoc[]; messages: ChatMessageDoc[] } {
		const messagesInTopics = new Set<string>();
		for (const topic of newTopics) {
			for (const msg of topic.messages) {
				messagesInTopics.add(this.createMessageKey(msg));
			}
		}

		const filterOut = (msgs: ChatMessageDoc[]) =>
			msgs.filter((m) => !messagesInTopics.has(this.createMessageKey(m)));

		const allTopics = [...docModel.topics, ...newTopics];
		const allMessages = [...filterOut(docModel.messages), ...filterOut(newMessagesDoc)];

		return { topics: allTopics, messages: allMessages };
	}
}
