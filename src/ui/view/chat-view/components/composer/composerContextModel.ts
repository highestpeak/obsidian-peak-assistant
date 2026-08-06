import type { TurnExecutionReceipt, ChatAssistantDefinition } from '@/core/types/chat-studio';
import type { ChatMessage, ChatProject } from '@/core/types/chat';
import type { ChatConversation } from '@/core/types/chat-vault';
import { filterActiveVariants } from '@/core/types/chat-message-variants';
import type { AnalysisHistoryRecord } from '@/core/ports/AnalysisHistoryPort';
import type { WorkingContext } from '@/service/context/types';
import { ChatProfile } from '@/service/chat/context/profiles/ChatProfile';
import type { ComposerDraft } from '../../store/composerStore';

export type ComposerContextLayerId =
	| 'system-prompt'
	| 'assistant'
	| 'recent-messages'
	| 'working-context'
	| 'conv-summary'
	| 'activity-index'
	| 'user-profile'
	| 'prev-analysis'
	| 'resource-index';

export type ComposerContextCompleteness = 'exact' | 'preview' | 'empty';

export interface ComposerContextLayerCopy {
	title: string;
	description: string;
	source: string;
	reason: string;
	treatment: string;
}

export interface ComposerContextModelCopy {
	layers: Record<ComposerContextLayerId, ComposerContextLayerCopy>;
	systemBaseNotice: string;
	customPromptLabel: string;
	focusFolderLabel: string;
	sourceScopeLabel: string;
	projectSourceLabel: string;
	vaultSourceLabel: string;
	webSourceLabel: string;
	explicitRefsLabel: string;
	activeFileLabel: string;
	workingThemeLabel: string;
	recentActivityLabel: string;
	projectDescriptionLabel: string;
	projectInstructionsLabel: string;
	projectSummaryLabel: string;
	conversationSummaryLabel: string;
	conversationTopicsLabel: string;
	userRoleLabel: string;
	assistantRoleLabel: string;
	analysisFallbackTitle: string;
	resourceFallbackTitle: string;
	emptyContent: string;
	requestProject: string;
	requestVault: string;
	requestWeb: string;
	requestExplicitRef: string;
	requestAttachment: string;
	requestDraft: string;
	requestAssistantKnowledge: string;
	assistantFrameTemplate: string;
}

export interface ComposerContextLayerPreview {
	id: ComposerContextLayerId;
	order: number;
	title: string;
	description: string;
	source: string;
	reason: string;
	treatment: string;
	required: boolean;
	priority: number;
	maxTokens: number | 'rest';
	maxCompressionLevel: 0 | 1 | 2 | 3;
	content: string;
	tokenEstimate: number;
	completeness: ComposerContextCompleteness;
	active: boolean;
}

export interface ComposerRequestScopeItem {
	id: string;
	kind: 'project' | 'vault' | 'web' | 'explicit-ref' | 'attachment' | 'draft';
	label: string;
	detail?: string;
}

export interface ComposerContextPreviewModel {
	layers: ComposerContextLayerPreview[];
	requestScope: ComposerRequestScopeItem[];
	activeCount: number;
	emptyCount: number;
	recentMessageCount: number;
	resourceCount: number;
	lastReceipt: TurnExecutionReceipt | null;
}

export interface BuildComposerContextPreviewInput {
	conversation: ChatConversation;
	project: ChatProject | null;
	draft: ComposerDraft;
	attachments: File[];
	assistant: ChatAssistantDefinition | null;
	workingContext: WorkingContext | null;
	userProfileMarkdown: string;
	analyses: AnalysisHistoryRecord[];
	lastReceipt: TurnExecutionReceipt | null;
	vaultAvailable: boolean;
	copy: ComposerContextModelCopy;
}

function estimateTokens(text: string): number {
	let cjkChars = 0;
	let otherChars = 0;
	for (const char of text) {
		if (char.charCodeAt(0) > 0x2e80) cjkChars += 1;
		else otherChars += 1;
	}
	return Math.ceil(cjkChars + otherChars / 3.5);
}

function block(label: string, value: string | null | undefined): string | null {
	const trimmed = value?.trim();
	if (!trimmed) return null;
	return `${label}\n${trimmed}`;
}

function joinBlocks(blocks: Array<string | null | undefined>): string {
	return blocks.filter((value): value is string => Boolean(value)).join('\n\n');
}

function formatTemplate(template: string, values: Record<string, string>): string {
	let output = template;
	for (const [key, value] of Object.entries(values)) {
		output = output.split(`{${key}}`).join(value);
	}
	return output;
}

function displayMessage(message: ChatMessage, copy: ComposerContextModelCopy): string {
	const label = message.role === 'assistant' ? copy.assistantRoleLabel : copy.userRoleLabel;
	return `${label}: ${message.content}`;
}

function systemContent(input: BuildComposerContextPreviewInput): string {
	const { conversation, draft, copy } = input;
	const sources = [
		draft.vaultSearch && input.vaultAvailable ? copy.vaultSourceLabel : null,
		draft.webSearch ? copy.webSourceLabel : null,
	].filter((value): value is string => Boolean(value));
	return joinBlocks([
		copy.systemBaseNotice,
		block(copy.customPromptLabel, conversation.meta.customSystemPrompt),
		block(copy.focusFolderLabel, conversation.meta.focusFolder),
		block(copy.sourceScopeLabel, sources.join(' · ')),
	]);
}

function assistantContent(input: BuildComposerContextPreviewInput): string {
	const instructions = input.assistant?.instructions.trim();
	if (!instructions) return '';
	return formatTemplate(input.copy.assistantFrameTemplate, {
		name: input.assistant?.name.trim() || input.copy.assistantRoleLabel,
		instructions,
	});
}

function recentMessagesContent(input: BuildComposerContextPreviewInput): { content: string; count: number } {
	const active = filterActiveVariants(input.conversation.messages).slice(-20);
	const messages = active.map((message) => displayMessage(message, input.copy));
	if (input.draft.text.trim()) {
		messages.push(`${input.copy.userRoleLabel} (${input.copy.requestDraft}): ${input.draft.text.trim()}`);
	}
	return {
		content: messages.join('\n\n'),
		count: messages.length,
	};
}

function workingContextContent(input: BuildComposerContextPreviewInput): string {
	const working = input.workingContext;
	if (!working) return '';
	const theme = working.workingTheme.llmInferred?.summary ?? working.workingTheme.ruleBased.summary;
	return joinBlocks([
		working.activeFile
			? block(input.copy.activeFileLabel, `${working.activeFile.title}\n${working.activeFile.path}`)
			: null,
		block(input.copy.workingThemeLabel, theme),
		working.recentActivities.length > 0
			? block(
				input.copy.recentActivityLabel,
				working.recentActivities.slice(0, 8).map((activity) => `- ${activity.summary}`).join('\n'),
			)
			: null,
	]);
}

function conversationSummaryContent(input: BuildComposerContextPreviewInput): string {
	const project = input.project;
	const conversation = input.conversation;
	return joinBlocks([
		block(input.copy.projectDescriptionLabel, project?.context?.description),
		block(input.copy.projectInstructionsLabel, project?.context?.instructions),
		block(input.copy.projectSummaryLabel, project?.context?.fullSummary ?? project?.context?.shortSummary),
		block(
			input.copy.conversationSummaryLabel,
			conversation.context?.fullSummary ?? conversation.context?.shortSummary,
		),
		conversation.context?.topics?.length
			? block(input.copy.conversationTopicsLabel, conversation.context.topics.join(' · '))
			: null,
	]);
}

function activityContent(input: BuildComposerContextPreviewInput): string {
	const activities = input.workingContext?.recentActivities ?? [];
	return activities.slice(0, 10).map((activity) => `- ${activity.summary}`).join('\n');
}

function analysisContent(input: BuildComposerContextPreviewInput): string {
	return input.analyses.slice(0, 3).map((record) => {
		const title = record.title ?? record.id ?? input.copy.analysisFallbackTitle;
		const query = record.query ? `“${record.query}” → ` : '';
		return `- ${query}${title}`;
	}).join('\n');
}

function resourceContent(input: BuildComposerContextPreviewInput): { content: string; count: number } {
	const projectResources = input.project?.context?.resourceIndex ?? [];
	const conversationResources = input.conversation.context?.resourceIndex ?? [];
	const resources = [...projectResources, ...conversationResources];
	return {
		content: resources.map((resource, index) => {
			const title = resource.title ?? resource.id ?? input.copy.resourceFallbackTitle;
			const detail = resource.shortSummary ?? resource.source ?? '';
			return `${index + 1}. ${title}${detail ? `\n   ${detail}` : ''}`;
		}).join('\n'),
		count: resources.length,
	};
}

function requestScope(input: BuildComposerContextPreviewInput): ComposerRequestScopeItem[] {
	const items: ComposerRequestScopeItem[] = [];
	if (input.conversation.meta.projectId) {
		items.push({
			id: `project:${input.conversation.meta.projectId}`,
			kind: 'project',
			label: input.copy.requestProject,
			detail: input.project?.meta.name ?? input.conversation.meta.projectId,
		});
	}
	if (input.draft.vaultSearch) {
		items.push({
			id: 'source:vault',
			kind: 'vault',
			label: input.copy.requestVault,
			detail: input.vaultAvailable ? undefined : input.copy.emptyContent,
		});
	}
	if (input.draft.webSearch) {
		items.push({ id: 'source:web', kind: 'web', label: input.copy.requestWeb });
	}
	for (const ref of input.draft.explicitRefs) {
		items.push({
			id: `ref:${ref.id}`,
			kind: 'explicit-ref',
			label: input.copy.requestExplicitRef,
			detail: ref.title || ref.uri,
		});
	}
	for (const attachment of input.attachments) {
		items.push({
			id: `attachment:${attachment.name}:${attachment.lastModified}`,
			kind: 'attachment',
			label: input.copy.requestAttachment,
			detail: attachment.name,
		});
	}
	if (input.draft.text.trim()) {
		items.push({
			id: 'draft:current',
			kind: 'draft',
			label: input.copy.requestDraft,
			detail: input.draft.text,
		});
	}
	for (const ref of input.assistant?.knowledgeRefs ?? []) {
		items.push({
			id: `assistant-knowledge:${ref.id}`,
			kind: 'explicit-ref',
			label: input.copy.requestAssistantKnowledge,
			detail: ref.title || ref.uri,
		});
	}
	return items;
}

export function buildComposerContextPreview(
	input: BuildComposerContextPreviewInput,
): ComposerContextPreviewModel {
	const recentMessages = recentMessagesContent(input);
	const resources = resourceContent(input);
	const contentById: Record<ComposerContextLayerId, string> = {
		'system-prompt': systemContent(input),
		assistant: assistantContent(input),
		'recent-messages': recentMessages.content,
		'working-context': workingContextContent(input),
		'conv-summary': conversationSummaryContent(input),
		'activity-index': activityContent(input),
		'user-profile': input.userProfileMarkdown.trim(),
		'prev-analysis': analysisContent(input),
		'resource-index': resources.content,
	};

	const layers = ChatProfile.slots.map((config, index) => {
		const id = config.slotId as ComposerContextLayerId;
		const copy = input.copy.layers[id];
		const content = contentById[id] ?? '';
		const active = content.trim().length > 0;
		return {
			id,
			order: index + 1,
			title: copy.title,
			description: copy.description,
			source: copy.source,
			reason: copy.reason,
			treatment: copy.treatment,
			required: config.required,
			priority: config.priority,
			maxTokens: config.maxTokens,
			maxCompressionLevel: config.maxCompressionLevel,
			content: active ? content : input.copy.emptyContent,
			tokenEstimate: active ? estimateTokens(content) : 0,
			completeness: active
				? id === 'assistant' ? 'exact' as const : 'preview' as const
				: 'empty' as const,
			active,
		};
	});

	const explicitResourceCount = input.draft.explicitRefs.length
		+ input.attachments.length
		+ (input.assistant?.knowledgeRefs.length ?? 0);
	return {
		layers,
		requestScope: requestScope(input),
		activeCount: layers.filter((layer) => layer.active).length,
		emptyCount: layers.filter((layer) => !layer.active).length,
		recentMessageCount: recentMessages.count,
		resourceCount: resources.count + explicitResourceCount,
		lastReceipt: input.lastReceipt,
	};
}
