import React, { useState, useEffect } from 'react';
import { useProjectStore } from '@/ui/store/projectStore';
import { IconButton } from '@/ui/component/shared-ui/icon-button';
import { Folder, RefreshCw } from 'lucide-react';
import { useServiceContext } from '@/ui/context/ServiceContext';
import { cn } from '@/ui/react/lib/utils';
import { ConversationUpdatedEvent, ViewEventType } from '@/core/eventBus';
import { useTypewriterEffect } from '@/ui/view/shared/useTypewriterEffect';
import { TYPEWRITER_EFFECT_SPEED_MS } from '@/core/constant';
import { ResourcesPopover } from './ResourcesPopover';
import { SummaryPopover } from './SummaryPopover';
import { OpenMenuButton } from './OpenMenuButton';

interface MessageHeaderProps {
}

/**
 * Component for rendering message header with title, model selector, and stats
 */
export const MessageHeader: React.FC<MessageHeaderProps> = ({
}) => {
	const { app, eventBus, manager } = useServiceContext();
	const activeConversation = useProjectStore((state) => state.activeConversation);
	const activeProject = useProjectStore((state) => state.activeProject);
	const [displayTitle, setDisplayTitle] = useState(activeConversation?.meta.title || '');
	const [enableTypewriter, setEnableTypewriter] = useState(false);
	const [isRegeneratingTitle, setIsRegeneratingTitle] = useState(false);

	// Listen for conversation title updates
	useEffect(() => {
		const unsubscribe = eventBus.on<ConversationUpdatedEvent>(
			ViewEventType.CONVERSATION_UPDATED,
			(event) => {
				// Only trigger typewriter if this is the active conversation
				if (event.conversation.meta.id === activeConversation?.meta.id) {
					setDisplayTitle(event.conversation.meta.title);
					// Show brief highlight effect on the updated title
					setEnableTypewriter(true);
					setIsRegeneratingTitle(false);
				}
			}
		);

		return () => {
			unsubscribe();
		};
	}, [eventBus, activeConversation?.meta.id]);

	// Update display title when active conversation changes (initial load, no typewriter)
	useEffect(() => {
		if (activeConversation?.meta.title) {
			setDisplayTitle(activeConversation.meta.title);
			// Disable typewriter on initial load
			setEnableTypewriter(false);
			// Reset regenerating state when conversation changes
			setIsRegeneratingTitle(false);
		}
	}, [activeConversation?.meta.id]); // Only reset on conversation change, not title change

	// Apply typewriter effect only when enabled
	const typewriterTitle = useTypewriterEffect({
		text: displayTitle,
		speed: TYPEWRITER_EFFECT_SPEED_MS,
		enabled: enableTypewriter,
	});

	// Disable typewriter after it completes
	useEffect(() => {
		if (enableTypewriter && typewriterTitle === displayTitle && displayTitle.length > 0) {
			// Typewriter effect completed, disable it
			setEnableTypewriter(false);
		}
	}, [enableTypewriter, typewriterTitle, displayTitle]);

	// Use typewriter title only when enabled, otherwise use displayTitle directly

	// Title element with scan effect when regenerating
	const titleElement = isRegeneratingTitle ? (
		<>
			<style dangerouslySetInnerHTML={{
				__html: `
					@keyframes scanEffect {
						25% { background-position: calc(1*100%/3) 0; }
						50% { background-position: calc(2*100%/3) 0; }
						75% { background-position: calc(3*100%/3) 0; }
						100% { background-position: calc(4*100%/3) 0; }
					}
				`
			}} />
			<span
				className="pktw-leading-[1.5] pktw-text-xl pktw-inline-block"
				style={{
					fontSize: 'var(--font-ui-large)',
					width: 'fit-content',
					color: '#0000',
					background: 'linear-gradient(90deg, #3b82f6 33%, #10b981 0 66%, #8b5cf6 0) 0 0/400% 100%',
					backgroundClip: 'text',
					WebkitBackgroundClip: 'text',
					animation: 'scanEffect 5s infinite cubic-bezier(0.3, 1, 0, 1)',
				}}
			>
				{displayTitle}
			</span>
		</>
	) : (
		<span
			className="pktw-font-medium pktw-text-foreground pktw-leading-[1.5] pktw-text-xl"
			style={{ fontSize: 'var(--font-ui-large)' }}
		>
			{enableTypewriter ? typewriterTitle : displayTitle}
		</span>
	);


	const handleRegenerateTitle = async () => {
		// Prevent multiple clicks while regenerating
		if (isRegeneratingTitle) {
			return;
		}

		const conversation = useProjectStore.getState().activeConversation;
		if (!conversation) {
			return;
		}

		try {
			// Show shimmer effect immediately
			setIsRegeneratingTitle(true);
			await manager.regenerateConversationTitle(conversation.meta.id);
		} catch (error) {
			console.error('Failed to regenerate conversation title:', error);
			setIsRegeneratingTitle(false);
		}
	};

	return (
		<div className="pktw-flex pktw-items-center pktw-justify-between pktw-gap-4 pktw-w-full">
			{/* Left side: Conversation name */}
			<div className="pktw-m-0 pktw-flex pktw-items-center pktw-gap-2 pktw-flex-nowrap pktw-flex-1 pktw-min-w-0">
				{activeConversation && (
					<>
						{activeProject && (
							<>
								<Folder className="pktw-inline-flex pktw-items-center pktw-flex-shrink-0" size={18} />
								<span className="pktw-font-medium pktw-text-foreground pktw-leading-[1.5]" style={{ fontSize: 'var(--font-ui-medium)' }}>{activeProject.meta.name}</span>
								<span className="pktw-text-muted-foreground pktw-mx-1" style={{ fontSize: 'var(--font-ui-medium)' }}> / </span>
							</>
						)}
						{titleElement}
						{!activeConversation.meta.titleManuallyEdited && (
							<IconButton
								size="md"
								onClick={isRegeneratingTitle ? undefined : handleRegenerateTitle}
								title={isRegeneratingTitle ? "Regenerating..." : "Regenerate conversation title"}
								className={cn(
									"hover:pktw-bg-gray-200",
									isRegeneratingTitle && [
										"pktw-opacity-40",
										"pktw-cursor-not-allowed",
										"!pktw-pointer-events-none",
										"pktw-select-none",
										"hover:!pktw-bg-transparent",
										"hover:!pktw-opacity-40"
									]
								)}
							>
								<RefreshCw className={cn("pktw-text-muted-foreground group-hover:pktw-text-black", isRegeneratingTitle && "pktw-animate-spin")} />
							</IconButton>
						)}
					</>
				)}
			</div>

			{/* Right side: Action buttons */}
			<div className="pktw-flex pktw-items-center pktw-gap-4 pktw-flex-shrink-0">
				{activeConversation && (
					<>
						{/* Action buttons */}
						<div className="pktw-flex pktw-items-center pktw-gap-1">
							{/* Resources button */}
							<ResourcesPopover />

							{/* Summary button */}
							<SummaryPopover />

							{/* Open menu button (merged open source document and open in chat) */}
							<OpenMenuButton />
						</div>
					</>
				)}
			</div>
		</div>
	);
};

