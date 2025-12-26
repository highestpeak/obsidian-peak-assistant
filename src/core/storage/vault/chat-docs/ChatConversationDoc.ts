import type { ChatMessage, ChatResourceRef } from '@/service/chat/types';

/**
 * Document model for conversation markdown (plain text, no meta).
 */
export interface ChatConversationSummaryModel {
	shortSummary: string;
	fullSummary: string;
}

export interface ChatConversationDocModel extends ChatConversationSummaryModel {
	messages: Array<{ content: string; role: ChatMessage['role']; title?: string }>;
	attachments: string[];
}

export class ChatConversationDoc {
	/**
	 * Build conversation markdown (plain text, no meta).
	 *
	 * Notes:
	 * - Attachments are deduplicated by `source`.
	 * - If attachments are omitted, they will be collected from message resources.
	 * - Conversation short/full summaries are stored in the file (not in DB).
	 * - Message short titles are optional and should be provided by a summary service.
	 */
	static buildMarkdown(params: {
		shortSummary?: string;
		fullSummary?: string;
		messages: ChatMessage[];
		attachments?: ChatResourceRef[];
	}): string {
		const { messages, attachments = [] } = params;

		// Collect all unique attachments from messages
		const allAttachments = new Map<string, ChatResourceRef>();
		for (const msg of messages) {
			if (msg.resources) {
				for (const res of msg.resources) {
					allAttachments.set(res.source, res as unknown as ChatResourceRef);
				}
			}
		}

		// Merge with provided attachments
		for (const att of attachments) {
			allAttachments.set(att.source, att);
		}

		return ChatConversationDoc.render(
			{
				shortSummary: (params.shortSummary ?? '').trim(),
				fullSummary: (params.fullSummary ?? '').trim(),
			},
			messages,
			Array.from(allAttachments.values())
		);
	}

	/**
	 * Render conversation markdown with messages and attachments.
	 */
	private static render(
		summary: ChatConversationSummaryModel,
		messages: ChatMessage[],
		attachments: ChatResourceRef[]
	): string {
		const sections: string[] = [];

		// Conversation summary sections (optional)
		if (summary.shortSummary) {
			sections.push('## Short Summary', summary.shortSummary, '');
		}
		if (summary.fullSummary) {
			sections.push('## Full Summary', summary.fullSummary, '');
		}

		// Render messages with emoji prefixes
		for (const msg of messages) {
			const emoji = msg.role === 'user' ? '💬' : msg.role === 'assistant' ? '🤖' : '🛠️';
			const shortTitle = (msg.title ?? '').trim();
			const header = shortTitle ? `## ${emoji} ${shortTitle}` : `## ${emoji}`;
			sections.push(header);
			sections.push(msg.content);
			sections.push(''); // Empty line between messages
		}

		// Render attachments section
		if (attachments.length > 0) {
			sections.push('## Attachments');
			for (const att of attachments) {
				sections.push(`- [[${att.source}]]`);
			}
		}

		return sections.join('\n').trim() + '\n';
	}

	/**
	 * Parse conversation markdown to extract summary, messages and attachments.
	 *
	 * Supported formats:
	 * - Sectioned headings: `## Short Summary`, `## Full Summary`, then emoji messages.
	 * - If summary headings are missing, summary fields are returned as empty strings.
	 */
	static parse(raw: string): ChatConversationDocModel {
		const messages: Array<{ content: string; role: ChatMessage['role']; title?: string }> = [];
		const attachments: string[] = [];

		// Find attachments section first and split it out
		const attachmentsIndex = raw.indexOf('## Attachments');
		const contentPart = attachmentsIndex >= 0 ? raw.substring(0, attachmentsIndex) : raw;
		const attachmentsPart = attachmentsIndex >= 0 ? raw.substring(attachmentsIndex) : '';

		const normalized = contentPart.replace(/\r\n/g, '\n');
		const pickSection = (heading: string): string => {
			const escaped = heading.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
			const re = new RegExp(
				`^##\\s+${escaped}\\s*$\\n([\\s\\S]*?)(?=^##\\s+|\\n?$)`,
				'm'
			);
			const m = normalized.match(re);
			return (m?.[1] ?? '').trim();
		};

		const shortSummary = pickSection('Short Summary');
		const fullSummary = pickSection('Full Summary');

		// Parse messages using regex to find headers
		// Title part is optional: `## 💬` or `## 💬 some title`
		const messageHeaderRegex = /^##\s+(💬|🤖|🛠️)(?:\s+(.*))?$/gm;
		let lastIndex = 0;
		let currentRole: ChatMessage['role'] | null = null;
		let currentTitle: string | undefined;
		let currentContentStart = 0;

		let match;
		while ((match = messageHeaderRegex.exec(contentPart)) !== null) {
			// Save previous message if exists
			if (currentRole !== null && currentContentStart < match.index) {
				const content = contentPart.substring(currentContentStart, match.index).trim();
				if (content) {
					messages.push({ role: currentRole, content, title: currentTitle });
				}
			}

			// Set new role
			const emoji = match[1];
			if (emoji === '💬') {
				currentRole = 'user';
			} else if (emoji === '🤖') {
				currentRole = 'assistant';
			} else if (emoji === '🛠️') {
				currentRole = 'system';
			}
			currentTitle = (match[2] ?? '').trim() || undefined;

			// Content starts after the header line
			currentContentStart = match.index + match[0].length;
			lastIndex = messageHeaderRegex.lastIndex;
		}

		// Add last message
		if (currentRole !== null && currentContentStart < contentPart.length) {
			const content = contentPart.substring(currentContentStart).trim();
			if (content) {
				messages.push({ role: currentRole, content, title: currentTitle });
			}
		}

		// Extract attachments
		if (attachmentsPart) {
			const attachmentLines = attachmentsPart.split('\n');
			for (const line of attachmentLines) {
				const match = line.match(/- \[\[([^\]]+)\]\]/);
				if (match) {
					attachments.push(match[1]);
				}
			}
		}

		return { shortSummary, fullSummary, messages, attachments };
	}

	// Intentionally no local short-title generator here.
	// Short titles should be supplied by a summary service at a higher layer.
}
