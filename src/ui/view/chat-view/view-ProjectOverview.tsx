import React, { useState, useEffect, useMemo, useCallback } from 'react';
import { ChatConversation, ChatProject, ChatMessage } from '@/service/chat/types';
import { useProjectStore } from '@/ui/store/projectStore';
import { cn } from '@/ui/react/lib/utils';
import { Folder, ChevronDown, ChevronRight, MessageCircle, MessageSquare, Calendar, Star, FileText, Image, File } from 'lucide-react';
import { useServiceContext } from '@/ui/context/ServiceContext';
import { ConversationItem } from '@/ui/view/chat-view/components/conversation-item';
import { ConversationUpdatedEvent, ViewEventType } from '@/core/eventBus';

interface ProjectOverviewViewProps {
	projectId: string;
	onConversationClick: (conversation: ChatConversation, project: ChatProject) => void;
	onMessageClick: (conversation: ChatConversation, project: ChatProject, messageId: string) => void;
}

type TabType = 'conversations' | 'starred' | 'resources';

interface StarredEntry {
	conversation: ChatConversation;
	message: ChatMessage;
}

interface ResourceAttachmentEntry {
	conversation: ChatConversation;
	message: ChatMessage;
	resource: string;
	resourceLabel: string;
}

/**
 * Project overview view component
 */
export const ProjectOverviewViewComponent: React.FC<ProjectOverviewViewProps> = ({
	projectId,
	onConversationClick,
	onMessageClick,
}) => {
	const { manager, app, eventBus } = useServiceContext();
	const projects = useProjectStore((state) => state.projects);
	const project = projectId ? projects.get(projectId) || null : null;
	
	const [conversations, setConversations] = useState<ChatConversation[]>([]);
	const [activeTab, setActiveTab] = useState<TabType>('conversations');
	const [summaryExpanded, setSummaryExpanded] = useState(false);

	// Load conversations
	useEffect(() => {
		const loadConversations = async () => {
			if (!project) return;
			const convs = await manager.listConversations(project.meta.id);
			convs.sort((a, b) => {
				const timeA = a.meta.createdAtTimestamp || 0;
				const timeB = b.meta.createdAtTimestamp || 0;
				return timeB - timeA;
			});
			setConversations(convs);
		};
		loadConversations();
	}, [project, manager]);

	// Listen for conversation updates and update only the affected item
	useEffect(() => {
		const unsubscribe = eventBus.on<ConversationUpdatedEvent>(
			ViewEventType.CONVERSATION_UPDATED,
			(event) => {
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

	// Set summary expanded based on whether summary exists
	useEffect(() => {
		if (project) {
			const summaryText = getProjectSummaryText(project);
			setSummaryExpanded(Boolean(summaryText));
		}
	}, [project]);

	if (!project) {
		return (
			<div className="pktw-flex pktw-items-center pktw-justify-center pktw-h-full pktw-text-muted-foreground">
				Project not found
			</div>
		);
	}

	const summaryText = getProjectSummaryText(project);
	const totalMessages = conversations.reduce((sum, conv) => sum + conv.messages.length, 0);

	// Load starred messages directly from database
	const [starredMessages, setStarredMessages] = useState<ChatMessage[]>([]);
	const [messageToConversationId, setMessageToConversationId] = useState<Map<string, string>>(new Map());
	
	useEffect(() => {
		const loadStarredMessages = async () => {
			if (!project) return;
			try {
				const result = await manager.listStarredMessagesByProject(project.meta.id);
				console.debug('[ProjectOverview] Starred messages:', result.messages);
				setStarredMessages(result.messages);
				setMessageToConversationId(result.messageToConversationId);
			} catch (error) {
				console.error('[ProjectOverview] Error loading starred messages:', error);
				setStarredMessages([]);
				setMessageToConversationId(new Map());
			}
		};
		loadStarredMessages();
	}, [project, manager]);

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

	const handleOpenAttachment = useCallback((path: string) => {
		if (!path) return;
		const cleaned = path.replace(/^\[\[|\]\]$/g, '');
		const normalized = cleaned.startsWith('/') ? cleaned.slice(1) : cleaned;
		void app.workspace.openLinkText(normalized, '', true);
	}, [app]);

	return (
		<div className="pktw-flex pktw-flex-col pktw-h-full pktw-overflow-hidde">
			<div className="pktw-flex-1 pktw-overflow-y-auto pktw-p-6">
				{/* Stats */}
				<div className="pktw-flex pktw-gap-4 pktw-mb-6">
					<div className="pktw-flex pktw-items-center pktw-gap-3 pktw-p-4 pktw-rounded-lg pktw-border pktw-border-border pktw-bg-card pktw-shadow-sm">
						<div className="pktw-p-2 pktw-rounded-md pktw-bg-blue-500/10">
							<MessageCircle className="pktw-w-5 pktw-h-5 pktw-text-blue-600 dark:pktw-text-blue-400" />
						</div>
						<div className="pktw-flex pktw-flex-col">
							<span className="pktw-text-sm pktw-font-medium pktw-text-muted-foreground">Conversations</span>
							<span className="pktw-text-2xl pktw-font-semibold pktw-text-foreground">{conversations.length}</span>
						</div>
					</div>
					<div className="pktw-flex pktw-items-center pktw-gap-3 pktw-p-4 pktw-rounded-lg pktw-border pktw-border-border pktw-bg-card pktw-shadow-sm">
						<div className="pktw-p-2 pktw-rounded-md pktw-bg-green-500/10">
							<MessageSquare className="pktw-w-5 pktw-h-5 pktw-text-green-600 dark:pktw-text-green-400" />
						</div>
						<div className="pktw-flex pktw-flex-col">
							<span className="pktw-text-sm pktw-font-medium pktw-text-muted-foreground">Messages</span>
							<span className="pktw-text-2xl pktw-font-semibold pktw-text-foreground">{totalMessages}</span>
						</div>
					</div>
				</div>

				{/* Project Summary */}
				{summaryText && (
					<div className="pktw-mb-6 pktw-border pktw-border-border pktw-rounded-lg pktw-bg-card pktw-shadow-sm pktw-overflow-hidden">
						<div
							className="pktw-flex pktw-items-center pktw-justify-between pktw-p-4 pktw-cursor-pointer hover:pktw-bg-muted/50 pktw-transition-colors"
							onClick={() => setSummaryExpanded(!summaryExpanded)}
						>
							<h3 className="pktw-text-base pktw-font-semibold pktw-text-foreground pktw-m-0">Project Summary</h3>
							{summaryExpanded ? (
								<ChevronDown className="pktw-w-4 pktw-h-4 pktw-text-muted-foreground" />
							) : (
								<ChevronRight className="pktw-w-4 pktw-h-4 pktw-text-muted-foreground" />
							)}
						</div>
						{summaryExpanded && (
							<div className="pktw-px-4 pktw-pb-4 pktw-text-sm pktw-text-foreground/90 pktw-leading-relaxed">
								{summaryText}
							</div>
						)}
					</div>
				)}

				{/* Tab Navigation */}
				<div className="pktw-flex pktw-gap-1 pktw-border-b pktw-border-border pktw-mb-6">
					{(['conversations', 'starred', 'resources'] as TabType[]).map((tab) => (
						<button
							key={tab}
							className={cn(
								'pktw-px-4 pktw-py-2.5 pktw-text-sm pktw-font-medium pktw-transition-all pktw-relative',
								'pktw-border-b-2 pktw-border-transparent',
								activeTab === tab
									? 'pktw-text-primary pktw-border-primary'
									: 'pktw-text-muted-foreground hover:pktw-text-foreground hover:pktw-border-muted-foreground/30'
							)}
							onClick={() => setActiveTab(tab)}
						>
							{tab === 'conversations' && 'Conversations'}
							{tab === 'starred' && 'Starred Messages'}
							{tab === 'resources' && 'Resources'}
						</button>
					))}
				</div>

				{/* Tab Content */}
				<div>
					{activeTab === 'conversations' && (
						<ConversationsTab
							conversations={conversations}
							onConversationClick={(conv) => onConversationClick(conv, project)}
						/>
					)}
					{activeTab === 'starred' && (
						<StarredTab
							entries={starredEntries}
							project={project}
							onClick={(conv, messageId) => onMessageClick(conv, project, messageId)}
						/>
					)}
					{activeTab === 'resources' && (
						<ResourcesTab
							resources={resources}
							onAttachmentClick={handleOpenAttachment}
						/>
					)}
				</div>
			</div>
		</div>
	);
};

interface ConversationsTabProps {
	conversations: ChatConversation[];
	onConversationClick: (conversation: ChatConversation) => void;
}

const ConversationsTab: React.FC<ConversationsTabProps> = ({ conversations, onConversationClick }) => {
	if (conversations.length === 0) {
		return (
			<div className="pktw-text-center pktw-text-muted-foreground pktw-py-12">
				<MessageCircle className="pktw-w-12 pktw-h-12 pktw-mx-auto pktw-mb-3 pktw-opacity-50" />
				<p className="pktw-text-sm">No conversations yet.</p>
			</div>
		);
	}

	return (
		<div className="pktw-space-y-3">
			{conversations.map((conversation) => (
				<ConversationItem
					key={conversation.meta.id}
					conversation={conversation}
					onClick={onConversationClick}
					maxPreviewLength={150}
				/>
			))}
		</div>
	);
};

interface StarredTabProps {
	entries: StarredEntry[];
	project: ChatProject;
	onClick: (conversation: ChatConversation, messageId: string) => void;
}

const StarredTab: React.FC<StarredTabProps> = ({ entries, onClick }) => {
	if (entries.length === 0) {
		return (
			<div className="pktw-text-center pktw-text-muted-foreground pktw-py-12">
				<Star className="pktw-w-12 pktw-h-12 pktw-mx-auto pktw-mb-3 pktw-opacity-50" />
				<p className="pktw-text-sm">No starred messages yet.</p>
			</div>
		);
	}

	return (
		<div className="pktw-space-y-3">
			{entries.map((entry, index) => {
				const messageContent = entry.message.content || '';
				const truncated = messageContent.length > 200
					? messageContent.substring(0, 200) + '...'
					: messageContent;
				return (
					<div
						key={`${entry.conversation.meta.id}-${entry.message.id}-${index}`}
						className={cn(
							'pktw-p-4 pktw-rounded-lg pktw-border pktw-border-muted-foreground/20 pktw-bg-card pktw-shadow-sm',
							'pktw-cursor-pointer pktw-transition-all',
							'hover:pktw-shadow-md hover:pktw-border-border-hover hover:pktw-bg-accent/50'
						)}
						onClick={() => onClick(entry.conversation, entry.message.id)}
					>
						<div className="pktw-flex pktw-items-center pktw-gap-2 pktw-mb-2">
							<Star className="pktw-w-4 pktw-h-4 pktw-fill-yellow-400 pktw-text-yellow-400 pktw-shrink-0" />
							<div className="pktw-text-xs pktw-font-medium pktw-text-muted-foreground pktw-truncate">
								{entry.conversation.meta.title}
							</div>
						</div>
						{messageContent && (
							<div className="pktw-text-sm pktw-text-foreground pktw-line-clamp-3 pktw-leading-relaxed pktw-mt-1">
								{truncated}
							</div>
						)}
					</div>
				);
			})}
		</div>
	);
};

interface ResourcesTabProps {
	resources: ResourceAttachmentEntry[];
	onAttachmentClick: (path: string) => void;
}

const ResourcesTab: React.FC<ResourcesTabProps> = ({ resources, onAttachmentClick }) => {
	const getFileIcon = (fileName: string) => {
		const ext = fileName.split('.').pop()?.toLowerCase();
		if (['png', 'jpg', 'jpeg', 'gif', 'webp', 'svg', 'bmp'].includes(ext || '')) {
			return Image;
		}
		return FileText;
	};

	const getFileType = (fileName: string): string => {
		const ext = fileName.split('.').pop()?.toLowerCase();
		if (['png', 'jpg', 'jpeg', 'gif', 'webp', 'svg', 'bmp'].includes(ext || '')) {
			return 'image';
		}
		if (ext === 'pdf') {
			return 'pdf';
		}
		if (['xlsx', 'xls'].includes(ext || '')) {
			return 'excel';
		}
		if (['docx', 'doc'].includes(ext || '')) {
			return 'word';
		}
		return ext || 'file';
	};

	if (resources.length === 0) {
		return (
			<div className="pktw-text-center pktw-text-muted-foreground pktw-py-12">
				<FileText className="pktw-w-12 pktw-h-12 pktw-mx-auto pktw-mb-3 pktw-opacity-50" />
				<p className="pktw-text-sm">No resources attached yet.</p>
			</div>
		);
	}

	return (
		<div className="pktw-space-y-3">
			{resources.map((entry, index) => {
				const FileIcon = getFileIcon(entry.resourceLabel);
				const fileType = getFileType(entry.resourceLabel);
				return (
					<div
						key={`${entry.conversation.meta.id}-${entry.resource}-${index}`}
						className={cn(
							'pktw-flex pktw-items-center pktw-gap-3 pktw-p-4 pktw-rounded-lg pktw-border pktw-border-muted-foreground/20 pktw-bg-card pktw-shadow-sm',
							'pktw-cursor-pointer pktw-transition-all',
							'hover:pktw-shadow-md hover:pktw-border-border-hover hover:pktw-bg-accent/50'
						)}
						onClick={() => onAttachmentClick(entry.resource)}
					>
						<div className="pktw-p-2 pktw-rounded-md pktw-bg-muted pktw-shrink-0">
							<FileIcon className="pktw-w-5 pktw-h-5 pktw-text-muted-foreground" />
						</div>
						<div className="pktw-flex-1 pktw-min-w-0">
							<div className="pktw-text-sm pktw-font-medium pktw-text-foreground pktw-truncate pktw-mb-1">
								{entry.conversation.meta.title} - {entry.resourceLabel}
							</div>
						</div>
						<div className="pktw-px-2.5 pktw-py-1 pktw-rounded-md pktw-bg-muted pktw-text-xs pktw-font-medium pktw-text-muted-foreground pktw-shrink-0 pktw-uppercase">
							{fileType}
						</div>
					</div>
				);
			})}
		</div>
	);
};

function getProjectSummaryText(project: ChatProject): string | undefined {
	const candidate = project.context?.shortSummary;
	const trimmed = candidate?.trim();
	return trimmed || undefined;
}

