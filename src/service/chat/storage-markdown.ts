import { stringifyYaml, TFile, Vault } from 'obsidian';
import { ChatContextWindow, ChatConversationMeta, ChatMessage, ChatProjectContext, ChatProjectMeta } from './types';
import {
	buildFrontmatter,
	codeBlock,
	extractCodeBlock,
	replaceOrAppendCodeBlock,
} from '@/core/utils/markdown-utils';

export function buildConversationMarkdown(params: {
	meta: ChatConversationMeta;
	context?: ChatContextWindow;
	messages: ChatMessage[];
	bodySections?: string;
}): string {
	const { meta, messages, context, bodySections } = params;
	// Store title in frontmatter to preserve original title (not slugified)
	const frontmatter = buildFrontmatter({
		id: meta.id,
		title: meta.title,
		projectId: meta.projectId ?? null,
		createdAtTimestamp: meta.createdAtTimestamp,
		updatedAtTimestamp: meta.updatedAtTimestamp,
		activeModel: meta.activeModel,
		activeProvider: meta.activeProvider,
		tokenUsageTotal: meta.tokenUsageTotal ?? 0,
		titleManuallyEdited: meta.titleManuallyEdited ?? false,
	});

	const sections: string[] = [];
	
	// Conversation Summary section
	sections.push('# Conversation Summary');
	sections.push('## meta');
	if (context) {
		sections.push(
			codeBlock('chat-conversation-summary', stringifyYaml({
				lastUpdatedTimestamp: context.lastUpdatedTimestamp,
				recentMessagesWindow: context.recentMessagesWindow,
			}))
		);
	} else {
		sections.push(
			codeBlock('chat-conversation-summary', stringifyYaml({
				lastUpdatedTimestamp: Date.now(),
				recentMessagesWindow: [],
			}))
		);
	}
	sections.push('## content');
	sections.push('defaultSummary');

	// Attachments section - collect all attachments from all messages
	const allAttachments = new Set<string>();
	for (const message of messages) {
		if (message.attachments) {
			for (const attachment of message.attachments) {
				allAttachments.add(attachment);
			}
		}
	}
	
	sections.push('# Attachments');
	if (allAttachments.size > 0) {
		const attachmentList = Array.from(allAttachments).map(att => `- [[${att}]]`).join('\n');
		sections.push(attachmentList);
	} else {
		sections.push('');
	}

	// Messages sections
	sections.push(messages.map(buildMessageSection).join('\n\n'));

	return `${frontmatter}${sections.join('\n\n')}\n`;
}

/**
 * Generate a short summary from message content for use in heading.
 * Mock implementation - returns default summary.
 */
function generateMessageSummary(content: string, maxLength: number = 30): string {
	return 'defaultSummary';
}

function buildMessageSection(message: ChatMessage): string {
	const rolePrefix = message.role === 'assistant' ? 'Bot' : 
	                   message.role === 'user' ? 'User' : 
	                   'System';
	const summary = generateMessageSummary(message.content);
	const header = `# MS-${rolePrefix}-${summary}`;
	
	// Meta section in list format, wrapped in code block
	const metaLines = [
		`- id: ${message.id}`,
		`  role: ${message.role}`,
		`  createdAtZone: ${message.createdAtZone}`,
		`  createdAtTimestamp: ${message.createdAtTimestamp}`,
		`  starred: ${message.starred}`,
		`  model: "${message.model}"`,
		`  provider: "${message.provider}"`,
		`  attachments: ${JSON.stringify(message.attachments ?? [])}`,
	];
	const metaSection = `## meta\n\n${codeBlock('yaml', metaLines.join('\n'))}`;
	
	// Thinking section - not available in current ChatMessage type, so skip for now
	// If thinking is added to ChatMessage in the future, uncomment this:
	// const thinkingSection = (message as any).thinking && Array.isArray((message as any).thinking)
	// 	? `## Thinking\n\n${(message as any).thinking.map((t: string) => `- ${t}`).join('\n')}`
	// 	: '';
	
	const trimmedContent = message.content.trim();
	
	const attachmentLinks = (message.attachments ?? []).map((att) => {
		const normalizedPath = att.startsWith('/') ? att.slice(1) : att;
		return `[[${normalizedPath}]]`;
	});

	const contentPieces: string[] = [];
	if (trimmedContent) {
		contentPieces.push(trimmedContent);
	}
	if (attachmentLinks.length > 0) {
		contentPieces.push(attachmentLinks.join('\n'));
	}

	const contentText = contentPieces.join('\n\n');
	const contentSection = `## content\n\n${codeBlock('markdown', contentText || '')}`;
	
	return `${header}\n\n${metaSection}\n\n${contentSection}`;
}

export function buildProjectMarkdown(params: {
	meta: ChatProjectMeta;
	context?: ChatProjectContext;
	bodySections?: string;
}): string {
	const { meta, context, bodySections } = params;
	// Don't store name in frontmatter, it's derived from folder name
	const { name, ...metaWithoutName } = meta;
	const frontmatter = buildFrontmatter(metaWithoutName);
	const summaryText = context?.summary ?? 'defaultSummary';
	const summaryTimestamp = context?.lastUpdatedTimestamp ?? Date.now();
	const sections: string[] = ['# Project Meta', codeBlock('chat-project', stringifyYaml(metaWithoutName))];

	sections.push('# Short Summary');
	sections.push('## meta');
	sections.push(
		codeBlock('project-short-summary', stringifyYaml({
			lastUpdatedTimestamp: summaryTimestamp,
		}))
	);
	sections.push('## content');
	sections.push(summaryText);

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


export async function saveMarkdownFile(vault: Vault, file: TFile | null, path: string, content: string): Promise<TFile> {
	if (file) {
		await vault.modify(file, content);
		return file;
	}
	return vault.create(path, content);
}

