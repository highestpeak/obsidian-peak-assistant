import React, { useState } from 'react';
import { ChatProject } from '@/service/chat/types';
import { cn } from '@/ui/react/lib/utils';
import { MessageSquare, Star, FileText } from 'lucide-react';
import { useServiceContext } from '@/ui/context/ServiceContext';
import { Button } from '@/ui/component/shared-ui/button';
import { FileIcon, getFileTypeByName } from '@/ui/view/shared/file-utils';
import { ResourceAttachmentEntry, useProjectLoad, useConversationLoad, StarredEntry } from './hooks';
import { openAttachment } from '@/core/utils/vault-utils';
import { useChatViewStore } from './store/chatViewStore';
import { ProjectSummary } from './components/project-summary';
import { ConversationList } from './components/conversation-list';

interface ProjectOverviewViewProps {
}

type TabType = 'conversations' | 'starred' | 'resources';

/**
 * Project overview view component
 */
export const ProjectOverviewViewComponent: React.FC<ProjectOverviewViewProps> = () => {
	const store = useChatViewStore();

	const projectId = store.projectForOverview?.meta.id;
	if (!projectId) {
		return (
			<div className="pktw-flex pktw-items-center pktw-justify-center pktw-h-full pktw-text-muted-foreground">
				No project selected.
			</div>
		);
	}

	const [activeTab, setActiveTab] = useState<TabType>('conversations');
	const [isEditingDesc, setIsEditingDesc] = useState(false);

	// Use unified project load hook for state management
	const {
		project,
		conversations,
		starredEntries,
		resources,
		totalMessages,
		summaryText,
	} = useProjectLoad(projectId);

	const [description, setDescription] = useState(project?.context?.shortSummary ?? '');
	const [descBeforeEdit, setDescBeforeEdit] = useState('');

	if (!project) {
		return (
			<div className="pktw-flex pktw-items-center pktw-justify-center pktw-h-full pktw-text-muted-foreground">
				Project not found
			</div>
		);
	}

	const handleStartEditing = () => {
		setDescBeforeEdit(description);
		setIsEditingDesc(true);
	};

	const handleSaveDesc = () => {
		setIsEditingDesc(false);
		// Description saved locally; persistence would go through storage layer
	};

	const handleCancelDesc = () => {
		setDescription(descBeforeEdit);
		setIsEditingDesc(false);
	};

	return (
		<div className="pktw-flex pktw-flex-col pktw-h-full pktw-overflow-hidde">
			<div className="pktw-flex-1 pktw-overflow-y-auto pktw-pt-10 pktw-w-4/6 pktw-mx-auto">
				{/* Inline Stats */}
				<div className="pktw-flex pktw-justify-center pktw-mb-4">
					<span className="pktw-text-sm pktw-text-muted-foreground">
						{conversations.length} conversations · {totalMessages} messages · {starredEntries.length} starred
					</span>
				</div>

				{/* Editable Description */}
				<div className="pktw-flex pktw-justify-center pktw-mb-8">
					{isEditingDesc ? (
						<input
							autoFocus
							value={description}
							onChange={(e) => setDescription(e.target.value)}
							onBlur={handleSaveDesc}
							onKeyDown={(e) => {
								if (e.key === 'Enter') handleSaveDesc();
								if (e.key === 'Escape') handleCancelDesc();
							}}
							className="pktw-w-full pktw-text-sm pktw-bg-transparent pktw-border-b pktw-border-border pktw-outline-none pktw-py-1"
						/>
					) : (
						<span
							onClick={handleStartEditing}
							className="pktw-text-sm pktw-text-muted-foreground pktw-cursor-pointer hover:pktw-text-foreground pktw-transition-colors"
						>
							{description || 'Click to add a description...'}
						</span>
					)}
				</div>

				{/* Tab Navigation */}
				<div className="pktw-flex pktw-justify-center pktw-gap-1 pktw-border-b pktw-border-border pktw-mb-6">
					{(['conversations', 'starred', 'resources'] as TabType[]).map((tab) => (
						<Button
							key={tab}
							variant="ghost"
							className={cn(
								'pktw-px-4 pktw-py-2.5 pktw-text-xl pktw-font-medium pktw-transition-all pktw-relative',
								'pktw-border-b-2 pktw-border-transparent',
								activeTab === tab
									? 'pktw-text-[var(--pk-accent,#6d28d9)] pktw-border-[var(--pk-accent,#6d28d9)]'
									: 'pktw-text-muted-foreground'
							)}
							onClick={() => setActiveTab(tab)}
						>
							{tab === 'conversations' && 'Conversations'}
							{tab === 'starred' && 'Starred Messages'}
							{tab === 'resources' && 'Resources'}
						</Button>
					))}
				</div>

				{/* Tab Content */}
				<div>
					{activeTab === 'conversations' && (
						<ConversationsTab
							projectId={projectId}
							project={project}
							summaryText={summaryText}
							conversationCount={conversations.length}
						/>
					)}
					{activeTab === 'starred' && (
						<StarredTab
							entries={starredEntries}
							project={project}
						/>
					)}
					{activeTab === 'resources' && (
						<ResourcesTab
							resources={resources}
						/>
					)}
				</div>
			</div>
		</div>
	);
};

interface ConversationsTabProps {
	projectId: string;
	project: ChatProject;
	summaryText?: string;
	conversationCount: number;
}

const ConversationsTab: React.FC<ConversationsTabProps> = ({
	projectId,
	project,
	summaryText,
	conversationCount,
}) => {

	const { loadConversation } = useConversationLoad();

	const [summaryExpanded, setSummaryExpanded] = useState<boolean>(summaryText ? true : false);

	const handleNewConversation = () => {
		useChatViewStore.getState().setPendingConversation({
			title: 'New Conversation',
			project,
		});
	};

	if (conversationCount === 0) {
		return (
			<div className="pktw-flex pktw-flex-col pktw-items-center pktw-justify-center pktw-py-12 pktw-gap-3">
				<MessageSquare className="pktw-w-10 pktw-h-10 pktw-text-muted-foreground/30" />
				<span className="pktw-text-sm pktw-text-muted-foreground">No conversations yet</span>
				<Button variant="default" onClick={handleNewConversation}>New Conversation</Button>
			</div>
		);
	}

	return (
		<div className="pktw-space-y-3">
			{/* Project Summary */}
			{/* Place here to make Tabs seem more balanced. Make ui more balanced. Choose Conv Tabs because it has more content. */}
			<ProjectSummary
				summaryText={summaryText}
				summaryExpanded={summaryExpanded}
				onSummaryExpandedChange={setSummaryExpanded}
			/>

			<ConversationList
				projectId={projectId}
				maxPreviewLength={150}
				emptyText="No conversations in this project yet."
			/>
		</div>
	);
};

interface StarredTabProps {
	entries: StarredEntry[];
	project: ChatProject;
}

const StarredTab: React.FC<StarredTabProps> = ({ entries }) => {

	const { openConvAndScroll2Msg } = useConversationLoad();

	if (entries.length === 0) {
		return (
			<div className="pktw-text-center pktw-text-muted-foreground pktw-py-12">
				<Star className="pktw-w-12 pktw-h-12 pktw-mx-auto pktw-mb-3 pktw-opacity-50" />
				<span className="pktw-text-sm">No starred messages yet.</span>
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
						onClick={() => openConvAndScroll2Msg(entry.conversation.meta.id, entry.message.id)}
					>
						<div className="pktw-flex pktw-items-center pktw-gap-2 pktw-mb-2">
							<Star className="pktw-w-4 pktw-h-4 pktw-fill-[var(--pk-warning,#f59e0b)] pktw-text-[var(--pk-warning,#f59e0b)] pktw-shrink-0" />
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
}

const ResourcesTab: React.FC<ResourcesTabProps> = ({ resources }) => {

	const { app } = useServiceContext();

	if (resources.length === 0) {
		return (
			<div className="pktw-text-center pktw-text-muted-foreground pktw-py-12">
				<FileText className="pktw-w-12 pktw-h-12 pktw-mx-auto pktw-mb-3 pktw-opacity-50" />
				<span className="pktw-text-sm">No resources attached yet.</span>
			</div>
		);
	}

	return (
		<div className="pktw-space-y-3">
			{resources.map((entry, index) => {
				const fileType = getFileTypeByName(entry.resourceLabel);
				return (
					<div
						key={`${entry.conversation.meta.id}-${entry.resource}-${index}`}
						className={cn(
							'pktw-flex pktw-items-center pktw-gap-3 pktw-p-4 pktw-rounded-lg pktw-border pktw-border-muted-foreground/20 pktw-bg-card pktw-shadow-sm',
							'pktw-cursor-pointer pktw-transition-all',
							'hover:pktw-shadow-md hover:pktw-border-border-hover hover:pktw-bg-accent/50'
						)}
						onClick={() => openAttachment(entry.resource)}
					>
						<div className="pktw-p-2 pktw-rounded-md pktw-bg-muted pktw-shrink-0">
							<FileIcon type={fileType} className="pktw-text-muted-foreground" size={20} />
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
