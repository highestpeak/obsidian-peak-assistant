import React, { useState, useCallback } from 'react';
import { FolderPlus, X } from 'lucide-react';
import { Button } from '@/ui/component/shared-ui/button';
import { useChatDataStore } from '@/ui/store/chatDataStore';
import { useServiceContext } from '@/ui/context/ServiceContext';
import { useChatViewStore } from '../store/chatViewStore';
import { cn } from '@/ui/react/lib/utils';
import { CONVERSATION_TO_PROJECT_THRESHOLD } from '@/core/constant';

/**
 * Subtle suggestion banner that appears when a standalone conversation
 * grows long enough to warrant promotion to a project.
 * Only shows for conversations without a projectId and with enough messages.
 */
export const ConvertToProjectSuggestion: React.FC = () => {
	const { manager } = useServiceContext();
	const activeConversation = useChatDataStore((s) => s.activeConversation);
	const [dismissed, setDismissed] = useState(false);
	const [converting, setConverting] = useState(false);

	const shouldShow = !dismissed
		&& activeConversation
		&& !activeConversation.meta.projectId
		&& activeConversation.messages.length >= CONVERSATION_TO_PROJECT_THRESHOLD;

	const handleConvert = useCallback(async () => {
		if (!activeConversation || converting) return;
		setConverting(true);
		try {
			// Create a project with the conversation title
			const project = await manager.proj.createProject({
				name: activeConversation.meta.title,
			});

			// Move conversation into the project
			await manager.conv.moveToProject({
				conversationId: activeConversation.meta.id,
				projectId: project.meta.id,
			});

			// Reload the conversation to reflect the change
			const updated = await manager.readConversation(activeConversation.meta.id, true);
			if (updated) {
				useChatViewStore.getState().setConversation(updated);
			}
			setDismissed(true);
		} catch (error) {
			console.error('[ConvertToProjectSuggestion] Failed to convert:', error);
		} finally {
			setConverting(false);
		}
	}, [activeConversation, manager, converting]);

	if (!shouldShow) return null;

	return (
		<div className={cn(
			'pktw-mx-4 pktw-mb-3 pktw-px-4 pktw-py-2.5 pktw-rounded-md',
			'pktw-border pktw-border-dashed pktw-border-border',
			'pktw-bg-muted/30',
			'pktw-flex pktw-items-center pktw-gap-3',
		)}>
			<FolderPlus className="pktw-w-4 pktw-h-4 pktw-text-muted-foreground pktw-flex-shrink-0" />
			<span className="pktw-text-xs pktw-text-muted-foreground pktw-flex-1">
				This conversation is growing. Convert to a project for better organization?
			</span>
			<Button
				variant="outline"
				size="sm"
				className="pktw-h-6 pktw-text-xs pktw-px-2"
				onClick={handleConvert}
				disabled={converting}
			>
				{converting ? 'Converting...' : 'Convert to project'}
			</Button>
			<Button
				variant="ghost"
				size="icon"
				className="pktw-h-5 pktw-w-5 pktw-text-muted-foreground"
				onClick={() => setDismissed(true)}
			>
				<X className="pktw-w-3 pktw-h-3" />
			</Button>
		</div>
	);
};
