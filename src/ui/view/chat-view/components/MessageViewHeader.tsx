import React from 'react';
import { useProjectStore } from '@/ui/store/projectStore';
import { useChatViewStore } from '../store/chatViewStore';
import { LLMModelSelector } from './LLMModelSelector';
import { StatsRendererComponent } from './StatsRenderer';
import { IconButton } from '@/ui/component/shared-ui/icon-button';
import { ArrowUp, ArrowDown, List, Lightbulb, FileText, Folder } from 'lucide-react';
import { openSourceFile } from '@/ui/view/shared/view-utils';
import { useServiceContext } from '@/ui/context/ServiceContext';
import { cn } from '@/ui/react/lib/utils';

interface MessageHeaderProps {
	onScrollToTop: () => void;
	onScrollToBottom: () => void;
}

/**
 * Component for rendering message header with title, model selector, and stats
 */
export const MessageHeader: React.FC<MessageHeaderProps> = ({
	onScrollToTop,
	onScrollToBottom,
}) => {
	const { app } = useServiceContext();
	const activeConversation = useProjectStore((state) => state.activeConversation);
	const activeProject = useProjectStore((state) => state.activeProject);
	const setShowResourcesModal = useChatViewStore((state) => state.setShowResourcesModal);
	const setShowSummaryModal = useChatViewStore((state) => state.setShowSummaryModal);

	const handleOpenSource = async () => {
		if (activeConversation?.file) {
			await openSourceFile(app, activeConversation.file);
		}
	};
	return (
		<div className="pktw-flex pktw-items-center pktw-justify-between pktw-gap-4 pktw-w-full">
			{/* Left side: Conversation name */}
			<div className="pktw-m-0 pktw-flex pktw-items-center pktw-gap-2 pktw-flex-nowrap pktw-flex-1 pktw-min-w-0">
				{activeConversation && activeProject ? (
					<>
						<Folder className="pktw-inline-flex pktw-items-center pktw-flex-shrink-0" size={18} />
						<span className="pktw-font-medium pktw-text-foreground pktw-leading-[1.5]" style={{ fontSize: 'var(--font-ui-medium)' }}>{activeProject.meta.name}</span>
						<span className="pktw-text-muted-foreground pktw-mx-1" style={{ fontSize: 'var(--font-ui-medium)' }}> / </span>
						<span className="pktw-font-medium pktw-text-foreground pktw-leading-[1.5]" style={{ fontSize: 'var(--font-ui-medium)' }}>{activeConversation.meta.title}</span>
					</>
				) : activeConversation ? (
					<h2 className="pktw-m-0 pktw-font-medium pktw-text-foreground pktw-inline pktw-leading-[1.5]" style={{ fontSize: 'var(--font-ui-medium)' }}>{activeConversation.meta.title}</h2>
				) : null}
			</div>

			{/* Right side: Model selector, stats, and action buttons */}
			<div className="pktw-flex pktw-items-center pktw-gap-4 pktw-flex-shrink-0">
				<LLMModelSelector />

				{activeConversation && (
					<>
						<StatsRendererComponent />
						
						{/* Action buttons */}
						<div className="pktw-flex pktw-items-center pktw-gap-1">
							{/* Scroll buttons */}
							<IconButton
								size="lg"
								onClick={onScrollToTop}
								title="Scroll to top"
							>
								<ArrowUp className="pktw-w-4 pktw-h-4" />
							</IconButton>
							<IconButton
								size="lg"
								onClick={onScrollToBottom}
								title="Scroll to latest"
							>
								<ArrowDown className="pktw-w-4 pktw-h-4" />
							</IconButton>

							{/* Resources button */}
							<IconButton
								size="lg"
								onClick={() => setShowResourcesModal(true)}
								title="View conversation resources"
							>
								<List className="pktw-w-4 pktw-h-4" />
							</IconButton>

							{/* Summary button (if available) */}
							{activeConversation.context?.summary && (
								<IconButton
									size="lg"
									onClick={() => setShowSummaryModal(true)}
									title="View conversation summary"
								>
									<Lightbulb className="pktw-w-4 pktw-h-4" />
								</IconButton>
							)}

							{/* Open source button */}
							<IconButton
								size="lg"
								onClick={handleOpenSource}
								title="Open source document"
							>
								<FileText className="pktw-w-4 pktw-h-4" />
							</IconButton>
						</div>
					</>
				)}
			</div>
		</div>
	);
};

