import React, { useState, useEffect, useMemo, useCallback } from 'react';
import { ChatConversation, ChatProject, ChatMessage } from '@/service/chat/types';
import { useProjectStore } from '@/ui/store/projectStore';
import { formatRelativeDate } from '@/ui/view/shared/date-utils';
import { cn } from '@/ui/react/lib/utils';
import { Folder, ChevronDown, ChevronRight } from 'lucide-react';
import { useServiceContext } from '@/ui/context/ServiceContext';

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
	const { manager, app } = useServiceContext();
	const projects = useProjectStore((state) => state.projects);
	const project = projectId ? projects.get(projectId) || null : null;
	
	const [conversations, setConversations] = useState<ChatConversation[]>([]);
	const [activeTab, setActiveTab] = useState<TabType>('conversations');
	const [summaryExpanded, setSummaryExpanded] = useState(false);

	// Load conversations
	useEffect(() => {
		const loadConversations = async () => {
			if (!project) return;
			const convs = await manager.listConversations(project.meta);
			convs.sort((a, b) => {
				const timeA = a.meta.createdAtTimestamp || 0;
				const timeB = b.meta.createdAtTimestamp || 0;
				return timeB - timeA;
			});
			setConversations(convs);
		};
		loadConversations();
	}, [project, manager]);

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

	// Collect starred entries
	const starredEntries = useMemo(() => {
		return conversations
			.flatMap(conversation =>
				conversation.messages
					.filter(message => message.starred)
					.map(message => ({ conversation, message }))
			)
			.sort((a, b) => (b.message.createdAtTimestamp ?? 0) - (a.message.createdAtTimestamp ?? 0));
	}, [conversations]);

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
		<div className="pktw-flex pktw-flex-col pktw-h-full pktw-overflow-hidden">
			<div className="pktw-flex-1 pktw-overflow-y-auto pktw-p-6">
				{/* Stats */}
				<div className="pktw-flex pktw-gap-4 pktw-mb-6">
					<div className="pktw-flex pktw-flex-col pktw-p-4 pktw-rounded-lg pktw-border pktw-border-border pktw-bg-card">
						<span className="pktw-text-sm pktw-text-muted-foreground">Conversations</span>
						<span className="pktw-text-2xl pktw-font-semibold pktw-text-foreground">{conversations.length}</span>
					</div>
					<div className="pktw-flex pktw-flex-col pktw-p-4 pktw-rounded-lg pktw-border pktw-border-border pktw-bg-card">
						<span className="pktw-text-sm pktw-text-muted-foreground">Messages</span>
						<span className="pktw-text-2xl pktw-font-semibold pktw-text-foreground">{totalMessages}</span>
					</div>
				</div>

				{/* Project Summary */}
				{summaryText && (
					<div className="pktw-mb-6 pktw-border pktw-border-border pktw-rounded-lg pktw-overflow-hidden">
						<div
							className="pktw-flex pktw-items-center pktw-justify-between pktw-p-4 pktw-cursor-pointer hover:pktw-bg-muted/50"
							onClick={() => setSummaryExpanded(!summaryExpanded)}
						>
							<h3 className="pktw-text-base pktw-font-semibold pktw-text-foreground pktw-m-0">Project Summary</h3>
							{summaryExpanded ? (
								<ChevronDown className="pktw-w-4 pktw-h-4" />
							) : (
								<ChevronRight className="pktw-w-4 pktw-h-4" />
							)}
						</div>
						{summaryExpanded && (
							<div className="pktw-p-4 pktw-pt-0 pktw-text-sm pktw-text-foreground">
								{summaryText}
							</div>
						)}
					</div>
				)}

				{/* Tab Navigation */}
				<div className="pktw-flex pktw-gap-1 pktw-border-b pktw-border-border pktw-mb-4">
					{(['conversations', 'starred', 'resources'] as TabType[]).map((tab) => (
						<button
							key={tab}
							className={cn(
								'pktw-px-4 pktw-py-2 pktw-text-sm pktw-font-medium pktw-transition-colors',
								'pktw-border-b-2 pktw-border-transparent',
								activeTab === tab
									? 'pktw-text-primary pktw-border-primary'
									: 'pktw-text-muted-foreground hover:pktw-text-foreground'
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
			<div className="pktw-text-center pktw-text-muted-foreground pktw-py-8">
				No conversations yet.
			</div>
		);
	}

	return (
		<div className="pktw-space-y-2">
			{conversations.map((conversation) => (
				<div
					key={conversation.meta.id}
					className={cn(
						'pktw-flex pktw-items-center pktw-gap-4 pktw-p-4 pktw-rounded-lg',
						'pktw-border pktw-border-border pktw-bg-card',
						'pktw-cursor-pointer pktw-transition-all',
						'hover:pktw-shadow-md hover:pktw-border-primary/50'
					)}
					onClick={() => onConversationClick(conversation)}
				>
					<div className="pktw-flex-1 pktw-min-w-0">
						<div className="pktw-text-base pktw-font-semibold pktw-text-foreground pktw-mb-1 pktw-truncate">
							{conversation.meta.title}
						</div>
						{conversation.messages.length > 0 && (
							<div className="pktw-text-sm pktw-text-muted-foreground pktw-line-clamp-2">
								{conversation.messages[0].content.substring(0, 100)}
								{conversation.messages[0].content.length > 100 ? '...' : ''}
							</div>
						)}
					</div>
					{conversation.meta.createdAtTimestamp && (
						<div className="pktw-text-xs pktw-text-muted-foreground pktw-shrink-0">
							{formatRelativeDate(conversation.meta.createdAtTimestamp)}
						</div>
					)}
				</div>
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
			<div className="pktw-text-center pktw-text-muted-foreground pktw-py-8">
				No starred messages yet.
			</div>
		);
	}

	return (
		<div className="pktw-space-y-3">
			{entries.map((entry, index) => {
				const truncated = entry.message.content.length > 150
					? entry.message.content.substring(0, 150) + '...'
					: entry.message.content;
				return (
					<div
						key={`${entry.conversation.meta.id}-${entry.message.id}-${index}`}
						className={cn(
							'pktw-p-4 pktw-rounded-lg pktw-border pktw-border-border pktw-bg-card',
							'pktw-cursor-pointer pktw-transition-all',
							'hover:pktw-shadow-md hover:pktw-border-primary/50'
						)}
						onClick={() => onClick(entry.conversation, entry.message.id)}
					>
						<div className="pktw-text-sm pktw-font-semibold pktw-text-foreground pktw-mb-2">
							{entry.conversation.meta.title}
						</div>
						<div className="pktw-text-sm pktw-text-muted-foreground pktw-line-clamp-3">
							{truncated}
						</div>
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
	if (resources.length === 0) {
		return (
			<div className="pktw-text-center pktw-text-muted-foreground pktw-py-8">
				No resources attached yet.
			</div>
		);
	}

	return (
		<div className="pktw-space-y-2">
			{resources.map((entry, index) => (
				<div
					key={`${entry.conversation.meta.id}-${entry.resource}-${index}`}
					className={cn(
						'pktw-p-3 pktw-rounded-lg pktw-border pktw-border-border pktw-bg-card',
						'pktw-cursor-pointer pktw-transition-all',
						'hover:pktw-shadow-md hover:pktw-border-primary/50'
					)}
					onClick={() => onAttachmentClick(entry.resource)}
				>
					<div className="pktw-text-sm pktw-text-foreground">
						{entry.conversation.meta.title} · {entry.resourceLabel}
					</div>
				</div>
			))}
		</div>
	);
};

function getProjectSummaryText(project: ChatProject): string | undefined {
	const candidate = project.shortSummary ?? project.context?.shortSummary;
	const trimmed = candidate?.trim();
	return trimmed || undefined;
}

