import React, { useCallback } from 'react';
import { FolderSearch, X } from 'lucide-react';
import { useChatDataStore } from '@/ui/store/chatDataStore';
import { useServiceContext } from '@/ui/context/ServiceContext';
import { Button } from '@/ui/component/shared-ui/button';
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from '@/ui/component/shared-ui/tooltip';
import { TFolder } from 'obsidian';

/**
 * Focus folder indicator shown in the chat header.
 * Displays the focused folder path with an option to clear it.
 * Clicking the icon when no focus is set opens a folder picker.
 */
export const FocusFolderIndicator: React.FC = () => {
	const { app, manager } = useServiceContext();
	const activeConversation = useChatDataStore((s) => s.activeConversation);
	const focusFolder = activeConversation?.meta?.focusFolder;

	const handleSetFocus = useCallback(async () => {
		if (!activeConversation) return;

		// Collect all vault folders
		const folders: string[] = [];
		app.vault.getAllLoadedFiles().forEach(f => {
			if (f instanceof TFolder && f.path !== '/') {
				folders.push(f.path);
			}
		});
		folders.sort();

		// Use Obsidian's built-in suggest modal for folder selection
		const { FuzzySuggestModal } = await import('obsidian');
		const modal = new (class extends FuzzySuggestModal<string> {
			getItems() { return folders; }
			getItemText(item: string) { return item; }
			async onChooseItem(item: string) {
				await manager.conv.updateConversationFocusFolder({
					conversationId: activeConversation.meta.id,
					focusFolder: item,
				});
				// Reload conversation to reflect updated meta
				const updated = await manager.readConversation(activeConversation.meta.id, true);
				if (updated) {
					useChatDataStore.getState().setActiveConversation(updated);
					useChatDataStore.getState().updateConversation(updated);
				}
			}
		})(app);
		modal.setPlaceholder('Select a folder to focus on...');
		modal.open();
	}, [app, manager, activeConversation]);

	const handleClearFocus = useCallback(async () => {
		if (!activeConversation) return;
		await manager.conv.updateConversationFocusFolder({
			conversationId: activeConversation.meta.id,
			focusFolder: undefined,
		});
		const updated = await manager.readConversation(activeConversation.meta.id, true);
		if (updated) {
			useChatDataStore.getState().setActiveConversation(updated);
			useChatDataStore.getState().updateConversation(updated);
		}
	}, [manager, activeConversation]);

	if (!activeConversation) return null;

	if (focusFolder) {
		return (
			<TooltipProvider>
				<Tooltip>
					<TooltipTrigger asChild>
						<div className="pktw-flex pktw-items-center pktw-gap-1 pktw-px-2 pktw-py-0.5 pktw-rounded pktw-bg-blue-500/10 pktw-text-blue-600 pktw-text-[10px] pktw-font-medium pktw-cursor-pointer" onClick={handleSetFocus}>
							<FolderSearch className="pktw-w-3 pktw-h-3" />
							<span className="pktw-truncate pktw-max-w-[120px]">{focusFolder}</span>
							<Button
								variant="ghost"
								size="sm"
								className="pktw-h-4 pktw-w-4 pktw-p-0 pktw-ml-0.5 hover:pktw-bg-blue-500/20"
								onClick={(e) => {
									e.stopPropagation();
									handleClearFocus();
								}}
							>
								<X className="pktw-w-2.5 pktw-h-2.5" />
							</Button>
						</div>
					</TooltipTrigger>
					<TooltipContent>
						<span>Focus: {focusFolder} (click to change, x to clear)</span>
					</TooltipContent>
				</Tooltip>
			</TooltipProvider>
		);
	}

	return (
		<TooltipProvider>
			<Tooltip>
				<TooltipTrigger asChild>
					<Button
						variant="ghost"
						size="sm"
						className="pktw-h-7 pktw-w-7 pktw-p-0"
						onClick={handleSetFocus}
					>
						<FolderSearch className="pktw-w-4 pktw-h-4 pktw-text-muted-foreground" />
					</Button>
				</TooltipTrigger>
				<TooltipContent>
					<span>Set folder focus</span>
				</TooltipContent>
			</Tooltip>
		</TooltipProvider>
	);
};
