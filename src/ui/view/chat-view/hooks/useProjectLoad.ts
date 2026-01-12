import { useState, useEffect, useMemo } from 'react';
import { ChatConversation, ChatProject, ChatMessage } from '@/service/chat/types';
import { ConversationUpdatedEvent, ViewEventType } from '@/core/eventBus';
import { useProjectStore } from '@/ui/store/projectStore';
import { useServiceContext } from '@/ui/context/ServiceContext';

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

/**
 * Unified hook for managing all project-related data loading and state
 * Combines conversations, starred messages, resources, and summary management
 */
export function useProjectLoad(projectId: string | null) {
	const { manager, eventBus } = useServiceContext();
	const project = useProjectStore((state) => projectId ? state.projects.get(projectId) || null : null);

	// Conversations state
	const [conversations, setConversations] = useState<ChatConversation[]>([]);

	// Starred messages state
	const [starredMessages, setStarredMessages] = useState<ChatMessage[]>([]);
	const [messageToConversationId, setMessageToConversationId] = useState<Map<string, string>>(new Map());

	// Load conversations
	useEffect(() => {
		const loadConversations = async () => {
			if (!project || !manager) return;
			const convs = await manager.listConversations(project.meta.id);
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
				const result = await manager.listStarredMessagesByProject(project.meta.id);
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

	return {
		// Data
		project,
		conversations,
		starredEntries,
		resources,
		totalMessages,
		summaryText,
	};
}

/**
 * Get project summary text from project context
 */
function getProjectSummaryText(project: ChatProject): string | undefined {
	const candidate = project.context?.shortSummary;
	const trimmed = candidate?.trim();
	return trimmed || undefined;
}