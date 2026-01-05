import type { ChatMessage, ChatResourceRef } from '@/service/chat/types';
import { hashMD5 } from '@/core/utils/hash-utils';

/**
 * ChatConversationDoc - Conversation Markdown Document Model
 * ==========================================================
 *
 * DESIGN OVERVIEW:
 * ---------------
 * This module handles the serialization and deserialization of chat conversations
 * to/from Markdown format. The design enforces a strict heading hierarchy to ensure
 * proper document structure and prevent content conflicts.
 *
 * FILE STRUCTURE ORDER:
 * ---------------------
 * The conversation markdown file follows a fixed structure:
 * 1. Attachments section (at the beginning)
 * 2. Short Summary section
 * 3. Full Summary section
 * 4. Topic sections (optional, each groups related messages)
 * 5. Messages (user and assistant only, not in any topic)
 *
 * HEADING HIERARCHY RULES:
 * ------------------------
 * 1. Section headers use level 1 heading (#)
 *    - `# Attachments` - Lists all attachment sources
 *    - `# Short Summary` - Brief conversation summary
 *    - `# Full Summary` - Detailed conversation summary
 *
 * 2. Topic sections use level 1 heading (#)
 *    - Format: `# Topic Title` (acts as separator, no special meaning)
 *    - Optional topic summary text (plain text, not a heading)
 *    - Groups related messages together
 *
 * 3. Top-level messages (user/assistant) use level 1 heading (#)
 *    - Format: `# 💬 [optional title]` or `# 🤖 [optional title]`
 *    - These are the primary conversation messages
 *    - Only user and assistant messages are rendered (system messages are excluded)
 *    - Messages can be grouped under topics or standalone
 *
 * 4. Message content must start with level 2 heading (##) or below
 *    - Content cannot start with level 1 heading (#)
 *    - This ensures proper nesting under the message header
 *    - If content starts with level 1, all headings are automatically incremented
 *
 * CONTENT NORMALIZATION:
 * ---------------------
 * When rendering user/assistant messages, if the content starts with a level 1
 * heading, the system automatically normalizes it by incrementing ALL heading
 * levels in the content by 1. This ensures:
 *
 * - Content hierarchy is preserved (relative levels maintained)
 * - Content properly nests under the message header
 * - No heading level conflicts occur
 *
 * Example normalization:
 *   Input content:
 *     # Main Topic
 *     ## Subtopic
 *     ### Detail
 *
 *   Normalized output:
 *     ## Main Topic
 *     ### Subtopic
 *     #### Detail
 *
 * PARSING:
 * --------
 * When parsing markdown, the system:
 * 1. Extracts attachments section (at the beginning)
 * 2. Extracts summary sections using pre-compiled regex patterns
 * 3. Identifies topic sections (level 1 headings that are not message headers or standard sections)
 * 4. Groups messages under their respective topics
 * 5. Identifies message headers by emoji (💬 user, 🤖 assistant)
 * 6. All messages use level 1 heading (#)
 * 7. Extracts content between headers
 *
 * PERFORMANCE:
 * ------------
 * All regular expressions are pre-compiled at module load time to avoid
 * runtime overhead. This includes:
 * - Heading patterns
 * - Message header patterns
 * - Attachment section patterns
 * - Summary section patterns (Short Summary, Full Summary)
 *
 * FILE FORMAT:
 * ------------
 * ```
 * # Attachments
 * - [[source1]]
 * - [[source2]]
 *
 * # Short Summary
 * [summary text]
 *
 * # Full Summary
 * [full summary text]
 *
 * # Topic1 xxxxxx
 * [optional topic summary text]
 *
 * # 💬 [optional title]
 * [message content starting with ## or below]
 *
 * # 🤖 [optional title]
 * [message content starting with ## or below]
 *
 * # Topic2 xxxxxx
 * [optional topic summary text]
 *
 * # 💬 [optional title]
 * [message content starting with ## or below]
 *
 * # 🤖 [optional title]
 * [message content starting with ## or below]
 *
 * # NoTopic
 * # 💬 [optional title]
 * [message content starting with ## or below]
 *
 * # 🤖 [optional title]
 * [message content starting with ## or below]
 * ```
 *
 * All comments and documentation must be in English (per project conventions).
 * TODO: Need caching for doc file read/write operations, otherwise any write/update will frequently update the file. Although the read/write volume isn't too large, it would be unnecessary.
 */

/**
 * Constants for markdown section headers
 */
const SECTION_ATTACHMENTS = '# Attachments';
const SECTION_SHORT_SUMMARY = '# Short Summary';
const SECTION_FULL_SUMMARY = '# Full Summary';

/**
 * Pre-compiled regular expressions for markdown parsing
 * These are created once at module load time to improve performance
 */
const REGEX_HEADING = /^(#{1,6})\s+(.+)$/; // Matches markdown headings (# to ######)
const REGEX_INDENT = /^(\s*)/; // Matches leading whitespace
// Matches attachments section with all attachment items: "# Attachments\n(- [[...]]\n)*"
const REGEX_ATTACHMENTS_SECTION = /^# Attachments\n((?:- \[\[[^\]]+\]\]\n?)*)/;
const REGEX_MESSAGE_HEADER = /^#\s+(💬|🤖)(?: ([^\n]+))?$/gm; // Matches message headers (# 💬 or # 🤖), optional title after space
const REGEX_ATTACHMENT_LINK = /- \[\[([^\]]+)\]\]/; // Matches attachment links (- [[source]])
const REGEX_CRLF = /\r\n/g; // Matches Windows line endings (CRLF)
// Pre-compiled regex for picking summary sections (created once at module load time)
const REGEX_SHORT_SUMMARY_SECTION = /^#\s+Short Summary\s*$\n([\s\S]*?)(?=^#\s+|\n?$)/m;
const REGEX_FULL_SUMMARY_SECTION = /^#\s+Full Summary\s*$\n([\s\S]*?)(?=^#\s+|\n?$)/m;
// Matches topic section header: "# Topic Title" (level 1 heading that's not a message header or standard section)
const REGEX_TOPIC_HEADER = /^#\s+([^\n💬🤖]+)$/gm;

/**
 * Message in document format (plain text representation).
 */
export interface ChatMessageDoc {
	role: 'user' | 'assistant' | 'system';
	content: string;
	title?: string;
}

/**
 * Topic section in conversation document.
 * Topic acts as a separator/grouping for messages.
 */
export interface ChatConversationTopicDoc {
	/**
	 * Topic title (e.g., "Topic1 xxxxxx").
	 * Used as level 1 heading (# Topic Title) in markdown.
	 */
	title: string;
	/**
	 * Optional topic summary text (plain text, not a heading).
	 */
	summary?: string;
	/**
	 * Messages belonging to this topic.
	 */
	messages: Array<ChatMessageDoc>;
}

export interface ChatConversationDocModel {
	/**
	 * Attachments (e.g., images, files, etc.).
	 */
	attachments: string[];
	/**
	 * Short summary of the conversation.
	 */
	shortSummary: string;
	/**
	 * Full summary of the conversation.
	 */
	fullSummary: string;
	/**
	 * Topic sections (each topic groups its messages).
	 */
	topics: ChatConversationTopicDoc[];
	/**
	 * Messages not belonging to any topic (rendered after all topics, under #NoTopic).
	 */
	messages: Array<ChatMessageDoc>;
}

export class ChatConversationDoc {

	/**
	 * Collect attachments from multiple sources (file, messages, explicit attachments).
	 */
	private static collectAttachments(
		docModel: ChatConversationDocModel,
		messages: ChatMessage[],
		newAttachments: ChatResourceRef[]
	): Map<string, ChatResourceRef> {
		const allAttachments = new Map<string, ChatResourceRef>();

		// Add parsed attachments from file
		for (const source of docModel.attachments) {
			allAttachments.set(source, { source } as ChatResourceRef);
		}

		// Add attachments from new messages
		for (const msg of messages) {
			if (msg.resources) {
				for (const res of msg.resources) {
					allAttachments.set(res.source, res as ChatResourceRef);
				}
			}
		}

		// Add new attachments
		for (const att of newAttachments) {
			allAttachments.set(att.source, att);
		}

		return allAttachments;
	}

	/**
	 * Convert ChatMessage array to ChatMessageDoc array (filtering out system messages).
	 */
	private static convertMessagesToDoc(messages: ChatMessage[]): ChatMessageDoc[] {
		return messages
			.filter(msg => msg.role === 'user' || msg.role === 'assistant')
			.map((msg) => ({
				role: msg.role as 'user' | 'assistant',
				content: msg.content,
				title: msg.title,
			}));
	}

	/**
	 * Create a unique key for message identification.
	 * Uses role + MD5 hash of content + title to identify messages.
	 * Using MD5 hash for content reduces memory usage and avoids issues with special characters.
	 */
	private static createMessageKey(msg: ChatMessageDoc): string {
		const contentHash = hashMD5(msg.content);
		return `${msg.role}|${contentHash}|${msg.title || ''}`;
	}

	/**
	 * Collect all message keys that are in the given topics.
	 * Returns a Set of message keys for fast lookup.
	 */
	private static collectMessagesInTopics(topics: ChatConversationTopicDoc[]): Set<string> {
		const messagesInTopics = new Set<string>();
		for (const topic of topics) {
			for (const topicMsg of topic.messages) {
				const msgKey = this.createMessageKey(topicMsg);
				messagesInTopics.add(msgKey);
			}
		}
		return messagesInTopics;
	}

	/**
	 * Filter messages to only include those that should go to NoTopic section.
	 * Removes messages that are already in topics.
	 */
	private static filterMessagesForNoTopic(
		messages: ChatMessageDoc[],
		messagesInTopics: Set<string>
	): ChatMessageDoc[] {
		return messages.filter((msg) => {
			const msgKey = this.createMessageKey(msg);
			return !messagesInTopics.has(msgKey);
		});
	}

	/**
	 * Merge topics and messages, handling deduplication.
	 * Returns both merged topics and merged messages for NoTopic section.
	 */
	private static mergeTopicsAndMessages(
		docModel: ChatConversationDocModel,
		newTopics: ChatConversationTopicDoc[],
		newMessagesDoc: ChatMessageDoc[]
	): { topics: ChatConversationTopicDoc[]; messages: ChatMessageDoc[] } {
		// Collect all messages that are in new topics
		const messagesInTopics = this.collectMessagesInTopics(newTopics);

		// Filter new messages: only keep those not in topics
		const messagesForNoTopic = this.filterMessagesForNoTopic(newMessagesDoc, messagesInTopics);

		// Filter existing NoTopic messages: remove those now in topics
		const existingMessagesForNoTopic = this.filterMessagesForNoTopic(
			docModel.messages,
			messagesInTopics
		);

		// Merge topics
		const allTopics = [...docModel.topics, ...newTopics];

		// Merge messages: combine existing and new NoTopic messages
		const allMessages = [...existingMessagesForNoTopic, ...messagesForNoTopic];

		return { topics: allTopics, messages: allMessages };
	}

	/**
	 * Append content to existing conversation markdown.
	 * 
	 * Strategy: Parse existing content, merge with new content, then re-render.
	 * This approach is simpler and more maintainable than trying to insert content
	 * at specific positions, especially when attachments need to be updated.
	 *
	 * IMPORTANT: Message Deduplication
	 * --------------------------------
	 * When both `messages` and `topics` are provided, messages that are already
	 * included in the topics will NOT be added to the NoTopic section. This prevents
	 * duplicate messages from appearing in both topics and NoTopic.
	 * 
	 * Additionally, if new topics contain messages that already exist in the document's
	 * NoTopic section (docModel.messages), those messages will be removed from NoTopic
	 * and moved to the topics. This handles the case where existing messages are
	 * reorganized into topics.
	 * 
	 * Example scenario 1 (new messages):
	 * - messages: [msg1, msg2, msg3]
	 * - topics: [{ title: "Topic1", messages: [msg1, msg2] }]
	 * - Result: msg1 and msg2 go to Topic1, only msg3 goes to NoTopic
	 * 
	 * Example scenario 2 (existing messages moved to topics):
	 * - Existing docModel.messages: [msg1, msg2, msg3]
	 * - topics: [{ title: "Topic1", messages: [msg1] }]
	 * - Result: msg1 moves from NoTopic to Topic1, msg2 and msg3 remain in NoTopic
	 *
	 * @param currentContent The existing markdown content
	 * @param params Content to append (messages, topics, or both)
	 * @returns New markdown content with appended content
	 */
	static appendMessagesToContent(
		currentContent: string,
		params: {
			topics?: ChatConversationTopicDoc[];
			messages?: ChatMessage[];
			attachments?: ChatResourceRef[];
		}
	): string {
		const { messages = [], topics: newTopics = [], attachments: newAttachments = [] } = params;

		// If nothing to append, return original content
		if (messages.length === 0 && newTopics.length === 0 && newAttachments.length === 0) {
			return currentContent;
		}

		const startTime = performance.now();

		// Parse existing content
		const docModel = this.parse(currentContent);

		// Collect attachments from multiple sources
		const allAttachments = this.collectAttachments(docModel, messages, newAttachments);

		// Convert new messages to ChatMessageDoc format
		const newMessagesDoc = this.convertMessagesToDoc(messages);

		// Merge topics and messages, handling deduplication
		const { topics: allTopics, messages: allMessages } = this.mergeTopicsAndMessages(
			docModel,
			newTopics,
			newMessagesDoc
		);

		// Build new content with merged data
		const newContent = this.buildMarkdown({
			docModel: {
				...docModel,
				topics: allTopics,
				messages: allMessages,
			},
			attachments: Array.from(allAttachments.values()),
		});

		const endTime = performance.now();
		const duration = endTime - startTime;
		console.debug(`[ChatConversationDoc] appendMessagesToContent took ${duration.toFixed(2)}ms`);

		return newContent;
	}

	/**
	 * Build conversation markdown (plain text, no meta).
	 *
	 * Notes:
	 * - Attachments are deduplicated by `source`.
	 * - If attachments are omitted, they will be collected from message resources.
	 * - Conversation short/full summaries are stored in the file (not in DB).
	 * - Message short titles are optional and should be provided by a summary service.
	 * - Topics are optional and used to group messages.
	 */
	static buildMarkdown(params: {
		docModel: ChatConversationDocModel;
		attachments?: ChatResourceRef[];
	}): string {
		const { docModel, attachments: providedAttachments = [] } = params;

		// Merge attachments from docModel and params
		const allAttachments = new Map<string, ChatResourceRef>();

		// Add attachments from docModel
		for (const source of docModel.attachments) {
			allAttachments.set(source, { source } as ChatResourceRef);
		}

		// Add/override with provided attachments
		for (const att of providedAttachments) {
			allAttachments.set(att.source, att);
		}

		return ChatConversationDoc.render(docModel, Array.from(allAttachments.values()));
	}

	/**
	 * Render conversation markdown with topics, messages and attachments.
	 *
	 * Order: Attachments -> Short Summary -> Full Summary -> Topics -> Messages (under #NoTopic)
	 *
	 * Rules:
	 * - User and assistant messages use level 1 heading (#) as header
	 * - Message content must start with level 2 heading (##) or below
	 * - Summary sections use level 1 heading (#)
	 * - Topic sections use level 1 heading (# Topic Title) as separator
	 * - Messages not in any topic are rendered under #NoTopic section
	 */
	private static render(
		docModel: ChatConversationDocModel,
		attachments: ChatResourceRef[]
	): string {
		const sections: string[] = [];

		// Render attachments section first (at the beginning)
		if (attachments.length > 0) {
			sections.push(SECTION_ATTACHMENTS);
			for (const att of attachments) {
				sections.push(`- [[${att.source}]]`);
			}
			sections.push(''); // Empty line after attachments
		}

		// Conversation summary sections (optional)
		if (docModel.shortSummary) {
			sections.push(SECTION_SHORT_SUMMARY, docModel.shortSummary, '');
		}
		if (docModel.fullSummary) {
			sections.push(SECTION_FULL_SUMMARY, docModel.fullSummary, '');
		}

		// Render topics
		for (const topic of docModel.topics) {
			sections.push(`# ${topic.title}`, ''); // Topic title followed by empty line
			if (topic.summary) {
				sections.push(topic.summary, '');
			}
			const topicMessagesMarkdown = this.renderMessagesFromArray(topic.messages);
			if (topicMessagesMarkdown) {
				sections.push(topicMessagesMarkdown);
			}
		}

		// Render messages not in any topic under #NoTopic
		if (docModel.messages.length > 0) {
			sections.push('# NoTopic', ''); // NoTopic title, empty line after
			const messagesMarkdown = this.renderMessagesFromArray(docModel.messages);
			if (messagesMarkdown) {
				sections.push(messagesMarkdown);
			}
		}

		return sections.join('\n').trim() + '\n';
	}


	/**
	 * Render messages from array format (internal helper).
	 */
	private static renderMessagesFromArray(
		messages: Array<ChatMessageDoc>
	): string {
		const sections: string[] = [];

		// Render each message
		for (const msg of messages) {
			const rendered = this.renderMessageFromArray(msg);
			if (rendered) {
				sections.push(rendered);
			}
		}

		return sections.join('\n');
	}

	/**
	 * Fix unclosed code blocks in message content.
	 * Ensures all code blocks (```) are properly closed to prevent markdown parsing errors.
	 * 
	 * @param content Message content
	 * @returns Content with all code blocks properly closed
	 */
	private static fixUnclosedCodeBlocks(content: string): string {
		if (!content) return content;

		// Count opening and closing code block markers (```)
		const codeBlockRegex = /```/g;
		const matches = content.match(codeBlockRegex);

		if (!matches) return content; // No code blocks found

		const count = matches.length;
		// If count is odd, we have an unclosed code block
		if (count % 2 === 0) return content; // All code blocks are closed

		// Add closing code block marker at the end
		// Ensure it's on a new line if content doesn't end with a newline or code block marker
		const trimmed = content.trimEnd();
		if (trimmed.endsWith('```')) {
			// Content already ends with ```, but count is odd, so we need another ```
			// This shouldn't happen normally, but handle it by adding a newline and closing marker
			return trimmed + '\n```';
		}

		// Add closing marker, ensuring it's on a new line
		const needsNewline = !trimmed.endsWith('\n');
		return trimmed + (needsNewline ? '\n```' : '```');
	}

	/**
	 * Render a single message from array format (internal helper).
	 */
	private static renderMessageFromArray(msg: ChatMessageDoc): string {
		// Only render user and assistant messages (top level)
		if (msg.role !== 'user' && msg.role !== 'assistant') {
			return '';
		}

		const emoji = msg.role === 'user' ? '💬' : '🤖';
		const shortTitle = (msg.title ?? '').trim();

		// User and assistant use level 1 heading
		const header = shortTitle ? `# ${emoji} ${shortTitle}` : `# ${emoji}`;

		// Normalize content level if needed (automatically fixes level 1 headings)
		let content = msg.content;
		if (this.needsNormalization(content, msg.role)) {
			content = this.normalizeContentLevel(content, msg.role);
		}

		// Fix unclosed code blocks to prevent markdown parsing errors
		content = this.fixUnclosedCodeBlocks(content);

		return `${header}\n${content}\n`;
	}

	/**
	 * Check if message content starts with level 1 heading.
	 * This is used to determine if normalization is needed.
	 *
	 * @returns true if content starts with level 1 heading, false otherwise
	 */
	private static needsNormalization(content: string, role: ChatMessage['role']): boolean {
		if (role !== 'user' && role !== 'assistant') {
			return false; // Only check user and assistant messages
		}

		const trimmed = content.trim();
		if (!trimmed) {
			return false; // Empty content doesn't need normalization
		}

		// Check if content starts with level 1 heading (# followed by space, not ##)
		const lines = trimmed.split('\n');
		for (const line of lines) {
			const trimmedLine = line.trim();
			if (!trimmedLine) {
				continue; // Skip empty lines
			}
			// Check if first non-empty line is exactly a level 1 heading (# Title)
			if (trimmedLine.startsWith('# ')) {
				return true;
			}
			break; // Only check the first non-empty line
		}
		return false;
	}

	/**
	 * Normalize content to ensure it starts with level 2 heading or below.
	 * If content starts with level 1 heading, all headings in the content will be incremented by one level.
	 *
	 * Example:
	 * - `# Title` → `## Title`
	 * - `## Subtitle` → `### Subtitle`
	 * - `### Sub-subtitle` → `#### Sub-subtitle`
	 * - All headings are incremented recursively to maintain hierarchy
	 *
	 * This is a public method so it can be used by ChatStore when appending messages.
	 */
	static normalizeContentLevel(content: string, role: ChatMessageDoc['role']): string {
		if (role !== 'user' && role !== 'assistant') {
			return content; // Only normalize user and assistant messages
		}

		const trimmed = content.trim();
		if (!trimmed) {
			return content;
		}

		const lines = trimmed.split('\n');
		let needsNormalization = false;

		// Check if content starts with level 1 heading
		for (const line of lines) {
			const trimmedLine = line.trim();
			if (!trimmedLine) {
				continue; // Skip empty lines
			}
			// If first non-empty line is exactly a level 1 heading (# Title)
			// Note: startsWith('# ') already excludes ##, ###, etc. (they start with '##')
			if (trimmedLine.startsWith('# ')) {
				needsNormalization = true;
				break;
			}
			// If we found any non-empty line that's not a level 1 heading, we're done checking
			break;
		}

		if (!needsNormalization) {
			return content; // Content already starts with level 2 or below, or is plain text
		}

		// Normalize: increment all heading levels by 1
		const normalized = lines.map((line) => {
			const trimmedLine = line.trim();
			// Match headings: #, ##, ###, ####, #####, ######
			const headingMatch = trimmedLine.match(REGEX_HEADING);
			if (headingMatch) {
				const level = headingMatch[1].length;
				const title = headingMatch[2];
				// Increment heading level (max is 6)
				const newLevel = Math.min(level + 1, 6);
				const newHeading = '#'.repeat(newLevel);
				// Preserve original indentation
				const indent = line.match(REGEX_INDENT)?.[1] || '';
				return indent + `${newHeading} ${title}`;
			}
			return line; // Not a heading, keep as-is
		});

		return normalized.join('\n');
	}

	/**
	 * Parse conversation markdown to extract summary, topics, messages and attachments.
	 *
	 * Supported formats:
	 * - Order: Attachments -> Short Summary -> Full Summary -> Topics -> Messages (under #NoTopic)
	 * - Summary sections use level 1 heading: `# Short Summary` or `# Full Summary`
	 * - Topic sections use level 1 heading: `# Topic Title` (acts as separator)
	 * - Messages not in topics are under `# NoTopic` section
	 * - User and assistant messages use level 1 heading: `# 💬` or `# 🤖`
	 * - Message content must start with level 2 heading (##) or below
	 * - If summary headings are missing, summary fields are returned as empty strings.
	 */
	static parse(raw: string): ChatConversationDocModel {
		// Step 1: Find key section indices
		const sectionIndices = this.findSectionIndices(raw);

		// Step 2: Parse each section
		const attachments = this.parseAttachments(raw, sectionIndices.attachmentsStart, sectionIndices.attachmentsEnd);
		const { shortSummary, fullSummary } = this.parseSummaries(
			raw,
			sectionIndices.summariesStart,
			sectionIndices.summariesEnd
		);
		const { topics, messages } = this.parseTopicsAndMessages(
			raw,
			sectionIndices.summariesEnd,
			raw.length
		);

		return {
			attachments,
			shortSummary,
			fullSummary,
			topics,
			messages,
		};
	}

	/**
	 * Find indices of key sections in the markdown.
	 */
	private static findSectionIndices(raw: string): {
		attachmentsStart: number;
		attachmentsEnd: number;
		summariesStart: number;
		summariesEnd: number;
	} {
		// Find attachments section
		const attachmentsIndex = raw.indexOf(SECTION_ATTACHMENTS);
		let attachmentsEnd = attachmentsIndex >= 0 ? attachmentsIndex + SECTION_ATTACHMENTS.length : 0;

		if (attachmentsIndex >= 0) {
			const afterAttachments = raw.substring(attachmentsIndex);
			const attachmentsEndMatch = afterAttachments.match(REGEX_ATTACHMENTS_SECTION);
			if (attachmentsEndMatch) {
				attachmentsEnd = attachmentsIndex + attachmentsEndMatch[0].length;
			} else {
				const lineEnd = afterAttachments.indexOf('\n', SECTION_ATTACHMENTS.length);
				attachmentsEnd = attachmentsIndex + (lineEnd >= 0 ? lineEnd + 1 : SECTION_ATTACHMENTS.length);
			}
		}

		const summariesStart = attachmentsEnd;
		const normalized = raw.substring(summariesStart).replace(REGEX_CRLF, '\n');

		// Find summary sections
		const shortSummaryMatch = normalized.match(REGEX_SHORT_SUMMARY_SECTION);
		const fullSummaryMatch = normalized.match(REGEX_FULL_SUMMARY_SECTION);

		let summariesEnd = 0;
		if (fullSummaryMatch) {
			const fullSummaryEnd = normalized.indexOf(fullSummaryMatch[0]) + fullSummaryMatch[0].length;
			let pos = fullSummaryEnd;
			while (pos < normalized.length && (normalized[pos] === '\n' || normalized[pos] === ' ')) {
				pos++;
			}
			summariesEnd = summariesStart + pos;
		} else if (shortSummaryMatch) {
			const shortSummaryEnd = normalized.indexOf(shortSummaryMatch[0]) + shortSummaryMatch[0].length;
			let pos = shortSummaryEnd;
			while (pos < normalized.length && (normalized[pos] === '\n' || normalized[pos] === ' ')) {
				pos++;
			}
			summariesEnd = summariesStart + pos;
		} else {
			summariesEnd = summariesStart;
		}

		return {
			attachmentsStart: attachmentsIndex >= 0 ? attachmentsIndex : 0,
			attachmentsEnd,
			summariesStart,
			summariesEnd,
		};
	}

	/**
	 * Parse attachments section.
	 */
	private static parseAttachments(raw: string, start: number, end: number): string[] {
		if (start < 0 || start >= end) {
			return [];
		}

		const attachmentsPart = raw.substring(start, end);
		const attachments: string[] = [];
		const attachmentLines = attachmentsPart.split('\n');

		for (const line of attachmentLines) {
			const match = line.match(REGEX_ATTACHMENT_LINK);
			if (match) {
				attachments.push(match[1]);
			}
		}

		return attachments;
	}

	/**
	 * Parse summary sections (Short Summary and Full Summary).
	 */
	private static parseSummaries(
		raw: string,
		start: number,
		end: number
	): { shortSummary: string; fullSummary: string } {
		const contentPart = raw.substring(start, end);
		const normalized = contentPart.replace(REGEX_CRLF, '\n');

		const shortSummaryMatch = normalized.match(REGEX_SHORT_SUMMARY_SECTION);
		const shortSummary = (shortSummaryMatch?.[1] ?? '').trim();

		const fullSummaryMatch = normalized.match(REGEX_FULL_SUMMARY_SECTION);
		const fullSummary = (fullSummaryMatch?.[1] ?? '').trim();

		return { shortSummary, fullSummary };
	}

	/**
	 * Parse topics and messages sections.
	 */
	private static parseTopicsAndMessages(
		raw: string,
		start: number,
		end: number
	): { topics: ChatConversationTopicDoc[]; messages: ChatMessageDoc[] } {
		const content = raw.substring(start, end);
		const normalized = content.replace(REGEX_CRLF, '\n');

		// Find all level 1 headings
		const headings = this.findLevel1Headings(normalized);

		const topics: ChatConversationTopicDoc[] = [];
		let messages: ChatMessageDoc[] = [];
		let currentTopic: ChatConversationTopicDoc | null = null;

		for (let i = 0; i < headings.length; i++) {
			const heading = headings[i];
			const nextHeading = i + 1 < headings.length ? headings[i + 1] : null;

			const headerLine = `# ${heading.title}`;
			const contentStart = heading.index + headerLine.length;
			const contentEnd = nextHeading ? nextHeading.index : normalized.length;

			// Skip newline after header
			let actualStart = contentStart;
			if (actualStart < normalized.length && normalized[actualStart] === '\n') {
				actualStart++;
			}

			const sectionContent = normalized.substring(actualStart, contentEnd);

			if (heading.isMessage) {
				// This is a message header
				const msg = this.parseMessageFromSection(sectionContent, heading.title);
				if (msg) {
					if (currentTopic) {
						currentTopic.messages.push(msg);
					} else {
						messages.push(msg);
					}
				}
			} else if (heading.title === 'NoTopic') {
				// Messages under #NoTopic - clear currentTopic first
				if (currentTopic) {
					topics.push(currentTopic);
					currentTopic = null;
				}
				// Parse messages under NoTopic
				const noTopicMessages = this.parseMessagesFromContent(sectionContent);
				messages.push(...noTopicMessages);
			} else {
				// This is a topic header
				if (currentTopic) {
					topics.push(currentTopic);
				}
				currentTopic = this.parseTopicSection(heading.title, sectionContent);
			}
		}

		// Save last topic if exists
		if (currentTopic) {
			topics.push(currentTopic);
		}

		return { topics, messages };
	}

	/**
	 * Find all level 1 headings in content.
	 */
	private static findLevel1Headings(content: string): Array<{ index: number; title: string; isMessage: boolean }> {
		const headings: Array<{ index: number; title: string; isMessage: boolean }> = [];
		const lines = content.split('\n');
		let charOffset = 0;

		for (const line of lines) {
			const trimmed = line.trim();
			if (trimmed.startsWith('# ')) {
				const title = trimmed.substring(2).trim();
				const isMessage = title.startsWith('💬') || title.startsWith('🤖');
				headings.push({
					index: charOffset,
					title,
					isMessage,
				});
			}
			charOffset += line.length + 1; // +1 for newline
		}

		return headings;
	}

	/**
	 * Parse a single topic section.
	 */
	private static parseTopicSection(title: string, content: string): ChatConversationTopicDoc {
		const trimmed = content.trim();

		// Find first message header in this section
		REGEX_MESSAGE_HEADER.lastIndex = 0;
		const firstMessageMatch = REGEX_MESSAGE_HEADER.exec(content);

		let topicSummary: string | undefined;
		let messagesContent = '';

		if (firstMessageMatch) {
			// There are messages in this topic
			const summaryEnd = firstMessageMatch.index;
			topicSummary = content.substring(0, summaryEnd).trim() || undefined;
			messagesContent = content.substring(summaryEnd);
		} else {
			// No messages, just summary text
			topicSummary = trimmed || undefined;
		}

		const messages = this.parseMessagesFromContent(messagesContent);

		return {
			title,
			summary: topicSummary,
			messages,
		};
	}

	/**
	 * Parse messages from content string.
	 */
	private static parseMessagesFromContent(content: string): ChatMessageDoc[] {
		const messages: ChatMessageDoc[] = [];

		// Find all message headers
		const messageMatches: Array<{ index: number; match: RegExpExecArray }> = [];
		REGEX_MESSAGE_HEADER.lastIndex = 0;
		let msgMatch;
		while ((msgMatch = REGEX_MESSAGE_HEADER.exec(content)) !== null) {
			messageMatches.push({ index: msgMatch.index, match: msgMatch });
		}

		// Parse each message
		for (let i = 0; i < messageMatches.length; i++) {
			const msgMatch = messageMatches[i];
			const nextMsgMatch = i + 1 < messageMatches.length ? messageMatches[i + 1] : null;

			const msgContentStart = msgMatch.index + msgMatch.match[0].length;
			const msgContentEnd = nextMsgMatch ? nextMsgMatch.index : content.length;

			// Skip newline after header
			let msgActualStart = msgContentStart;
			if (msgActualStart < content.length && content[msgActualStart] === '\n') {
				msgActualStart++;
			}

			const msgContent = content.substring(msgActualStart, msgContentEnd).trim();
			if (msgContent) {
				const role = msgMatch.match[1] === '💬' ? 'user' : 'assistant';
				const title = (msgMatch.match[2] ?? '').trim() || undefined;
				messages.push({ role, content: msgContent, title });
			}
		}

		return messages;
	}

	/**
	 * Parse a single message from section content.
	 */
	private static parseMessageFromSection(content: string, headerTitle: string): ChatMessageDoc | null {
		const trimmedContent = content.trim();
		if (!trimmedContent) {
			return null;
		}

		const role = headerTitle.startsWith('💬') ? 'user' : 'assistant';
		const titleMatch = headerTitle.match(/^(💬|🤖)\s+(.+)$/);
		const title = titleMatch ? titleMatch[2] : undefined;

		return { role, content: trimmedContent, title };
	}

	// Intentionally no local short-title generator here.
	// Short titles should be supplied by a summary service at a higher layer.
}
