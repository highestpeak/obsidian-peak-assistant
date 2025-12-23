import { stringifyYaml, TFile, Vault } from 'obsidian';
import { ChatContextWindow, ChatConversationMeta, ChatMessage, ChatProjectContext, ChatProjectMeta } from './types';
import {
	buildFrontmatter,
	codeBlock,
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
		const contextMeta: any = {
			lastUpdatedTimestamp: context.lastUpdatedTimestamp,
			recentMessagesWindow: context.recentMessagesWindow,
		};
		if (context.topics && context.topics.length > 0) {
			contextMeta.topics = context.topics;
		}
		if (context.resourceIndex && context.resourceIndex.length > 0) {
			contextMeta.resourceIndex = context.resourceIndex;
		}
		sections.push(
			codeBlock('chat-conversation-summary', stringifyYaml(contextMeta))
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
	// Use shortSummary if available, fallback to summary
	const summaryText = context?.shortSummary || context?.summary || 'defaultSummary';
	sections.push(summaryText);
	
	// Full summary section (if available)
	if (context?.fullSummary) {
		sections.push('## full');
		sections.push(context.fullSummary);
	}

	// Resources section - collect all resources from all messages
	const allResources = new Set<string>();
	for (const message of messages) {
		if (message.resources) {
			for (const resource of message.resources) {
				allResources.add(resource.source);
			}
		}
	}
	
	if (allResources.size > 0) {
		sections.push('# Resources');
		const resourceList = Array.from(allResources).map(res => `- [[${res}]]`).join('\n');
		sections.push(resourceList);
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
	];
	
	// Resources field
	if (message.resources && message.resources.length > 0) {
		metaLines.push(`  resources: ${JSON.stringify(message.resources)}`);
	}
	
	// Token usage
	if (message.tokenUsage) {
		metaLines.push(`  tokenUsage: ${JSON.stringify(message.tokenUsage)}`);
	}
	
	// Error and visibility flags
	if (message.isErrorMessage !== undefined) {
		metaLines.push(`  isErrorMessage: ${message.isErrorMessage}`);
	}
	if (message.isVisible !== undefined) {
		metaLines.push(`  isVisible: ${message.isVisible}`);
	}
	
	// Generation time (assistant only)
	if (message.genTimeMs !== undefined) {
		metaLines.push(`  genTimeMs: ${message.genTimeMs}`);
	}
	
	const metaSection = `## meta\n\n${codeBlock('yaml', metaLines.join('\n'))}`;
	
	// Thinking section
	const thinkingSection = message.thinking
		? `## Thinking\n\n${codeBlock('markdown', message.thinking)}`
		: '';
	
	// Content section - only store original content
	const contentSection = `## content\n\n${codeBlock('markdown', message.content || '')}`;
	
	const sections = [header, metaSection];
	if (thinkingSection) {
		sections.push(thinkingSection);
	}
	sections.push(contentSection);
	
	return sections.join('\n\n');
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
	const summaryText = context?.shortSummary || context?.summary || 'defaultSummary';
	const summaryTimestamp = context?.lastUpdatedTimestamp ?? Date.now();
	const sections: string[] = ['# Project Meta', codeBlock('chat-project', stringifyYaml(metaWithoutName))];

	sections.push('# Short Summary');
	sections.push('## meta');
	const summaryMeta: any = {
		lastUpdatedTimestamp: summaryTimestamp,
	};
	if (context?.resourceIndex && context.resourceIndex.length > 0) {
		summaryMeta.resourceIndex = context.resourceIndex;
	}
	sections.push(
		codeBlock('project-short-summary', stringifyYaml(summaryMeta))
	);
	sections.push('## content');
	sections.push(summaryText);
	
	// Full summary section (if available)
	if (context?.fullSummary) {
		sections.push('## full');
		sections.push(context.fullSummary);
	}

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
