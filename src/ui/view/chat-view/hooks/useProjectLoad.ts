import { useState, useEffect, useMemo, useCallback } from 'react';
import { ChatConversation, ChatProject, ChatMessage } from '@/service/chat/types';
import { ConversationUpdatedEvent, ViewEventType } from '@/core/eventBus';
import { useChatDataStore } from '@/ui/store/chatDataStore';
import { useServiceContext } from '@/ui/context/ServiceContext';
import type { ProjectPlanRef, ChatArtifactReceipt } from '@/core/types/chat-studio';

export interface StarredEntry {
	conversation: ChatConversation;
	message: ChatMessage;
}

export interface ResourceAttachmentEntry {
	conversation: ChatConversation;
	message: ChatMessage;
	resource: string;
	resourceLabel: string;
}

export interface ProjectResourceRow {
	kind: 'attachment' | 'artifact';
	id: string;
	title: string;
	subtitle?: string;
	openTarget?: string;
	timestamp: number;
	attachment?: ResourceAttachmentEntry;
	artifact?: ChatArtifactReceipt;
}

/**
 * Unified hook for managing all project-related data loading and state
 * Combines conversations, starred messages, resources, and summary management
 */
export function useProjectLoad(projectId: string | null) {
	const { manager, eventBus } = useServiceContext();
	const project = useChatDataStore((state) => projectId ? state.projects.get(projectId) || null : null);

	// Conversations state
	const [conversations, setConversations] = useState<ChatConversation[]>([]);

	// Starred messages state
	const [starredMessages, setStarredMessages] = useState<ChatMessage[]>([]);
	const [messageToConversationId, setMessageToConversationId] = useState<Map<string, string>>(new Map());

	// Load conversations
	useEffect(() => {
		const loadConversations = async () => {
			if (!project || !manager) return;
			const convs = await manager.conv.listConversations(project.meta.id);
			convs.sort((a: ChatConversation, b: ChatConversation) => {
				const timeA = a.meta.createdAtTimestamp || 0;
				const timeB = b.meta.createdAtTimestamp || 0;
				return timeB - timeA;
			});
			setConversations(convs);
		};
		loadConversations();
	}, [project, manager]);

	// Load starred messages directly from database
	useEffect(() => {
		const loadStarredMessages = async () => {
			if (!project || !manager) return;
			try {
				const result = await manager.conv.listStarredMessagesByProject(project.meta.id);
				setStarredMessages(result.messages);
				setMessageToConversationId(result.messageToConversationId);
			} catch (error) {
				setStarredMessages([]);
				setMessageToConversationId(new Map());
			}
		};
		loadStarredMessages();
	}, [project, manager]);

	// Collect resources
	const resources = useMemo(() => {
		const seen = new Set<string>();
		const entries: ResourceAttachmentEntry[] = [];

		for (const conversation of conversations) {
			for (const message of conversation.messages) {
				if (!message.resources || message.resources.length === 0) {
					continue;
				}
				for (const resourceRef of message.resources) {
					const key = `${message.id}:${resourceRef.source}`;
					if (seen.has(key)) continue;
					seen.add(key);
					const label = resourceRef.source.split('/').pop() || resourceRef.source;
					entries.push({
						conversation,
						message,
						resource: resourceRef.source,
						resourceLabel: label,
					});
				}
			}
		}

		return entries.sort(
			(a, b) =>
				(b.message.createdAtTimestamp ?? 0) - (a.message.createdAtTimestamp ?? 0)
		);
	}, [conversations]);

	// Listen for conversation updates and update only the affected item
	useEffect(() => {
		const unsubscribe = eventBus.on(
			ViewEventType.CONVERSATION_UPDATED,
			(event: ConversationUpdatedEvent) => {
				// Only update if the updated conversation belongs to this project
				if (project && event.conversation.meta.projectId === project.meta.id) {
					setConversations(prev => {
						// Use map to update the matching conversation without using index
						return prev.map(conv =>
							conv.meta.id === event.conversation.meta.id
								? event.conversation
								: conv
						);
					});
				}
			}
		);
		return unsubscribe;
	}, [eventBus, project]);


	// Collect starred entries from directly loaded starred messages
	const starredEntries = useMemo(() => {
		// Create a map of conversation ID to conversation for quick lookup
		const convMap = new Map<string, ChatConversation>();
		conversations.forEach(conv => convMap.set(conv.meta.id, conv));

		// Map starred messages to entries with their conversations using conversationId mapping
		return starredMessages
			.map(message => {
				const conversationId = messageToConversationId.get(message.id);
				const conversation = conversationId ? convMap.get(conversationId) : undefined;
				return conversation ? { conversation, message } : null;
			})
			.filter((entry): entry is StarredEntry => entry !== null)
			.sort((a, b) => (b.message.createdAtTimestamp ?? 0) - (a.message.createdAtTimestamp ?? 0));
	}, [starredMessages, messageToConversationId, conversations]);

	// Calculate total messages
	const totalMessages = conversations.reduce((sum, conv) => sum + conv.messages.length, 0);

	// Get summary text
	const summaryText = project ? getProjectSummaryText(project) : undefined;

	// Plans + artifact receipts (chat-studio §9 / §9.1 / PROJ-04 / Resources tab)
	const [plans, setPlans] = useState<ProjectPlanRef[]>([]);
	const [artifactReceipts, setArtifactReceipts] = useState<ChatArtifactReceipt[]>([]);

	const reloadPlans = useCallback(async () => {
		if (!project || !manager) return;
		try {
			const rows = await manager.proj.listPlans(project.meta.id);
			setPlans(rows);
		} catch {
			setPlans([]);
		}
	}, [project, manager]);

	useEffect(() => { void reloadPlans(); }, [reloadPlans]);

	useEffect(() => {
		const loadArtifacts = async () => {
			if (!project || !manager) return;
			try {
				const rows = await manager.conv.listArtifactReceiptsByProject(project.meta.id);
				setArtifactReceipts(rows);
			} catch {
				setArtifactReceipts([]);
			}
		};
		void loadArtifacts();
	}, [project, manager]);

	// Merged Resources projection (attachments + generated artifact receipts).
	const resourceRows = useMemo<ProjectResourceRow[]>(() => {
		return mergeResourceRows(resources, artifactReceipts);
	}, [resources, artifactReceipts]);

	return {
		// Data
		project,
		conversations,
		starredEntries,
		resources,
		resourceRows,
		totalMessages,
		summaryText,
		plans,
		reloadPlans,
		artifactReceipts,
	};
}

/**
 * Merge attachment rows + artifact receipts into a unified Resources projection
 * (chat-studio §9 Resources tab). Kept pure so it's independently testable.
 */
export function mergeResourceRows(
	attachments: ResourceAttachmentEntry[],
	artifacts: ChatArtifactReceipt[],
): ProjectResourceRow[] {
	const rows: ProjectResourceRow[] = [];

	for (const a of attachments) {
		rows.push({
			kind: 'attachment',
			id: `att:${a.conversation.meta.id}:${a.message.id}:${a.resource}`,
			title: a.resourceLabel,
			subtitle: a.conversation.meta.title,
			openTarget: a.resource,
			timestamp: a.message.createdAtTimestamp ?? 0,
			attachment: a,
		});
	}
	for (const r of artifacts) {
		rows.push({
			kind: 'artifact',
			id: `art:${r.artifactId}`,
			title: r.title,
			subtitle: r.kind,
			openTarget: r.vaultPath ?? r.externalUri ?? r.uri,
			timestamp: r.createdAt,
			artifact: r,
		});
	}
	return rows.sort((a, b) => b.timestamp - a.timestamp);
}

/**
 * Get project summary text from project context
 */
function getProjectSummaryText(project: ChatProject): string | undefined {
	const candidate = project.context?.shortSummary;
	const trimmed = candidate?.trim();
	return trimmed || undefined;
}