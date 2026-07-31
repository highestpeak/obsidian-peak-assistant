import React, { useEffect, useState } from 'react';
import { ExternalLink, GitBranch, RefreshCw, PanelRight } from 'lucide-react';
import { Button, IconButton } from '@/ui/components/primitives';
import { useChatDataStore } from '@/ui/store/chatDataStore';
import { useServiceContext } from '@/ui/context/ServiceContext';
import { useChatStrings } from '../chatStringsContext';
import { useChatViewStore } from '../store/chatViewStore';
import { useChatNavigation } from '../useChatNavigation';

export interface HeaderProps {}

/**
 * Header — minimal chat header per the 2026-05-29 retained design.
 *
 * Anatomy: [conversation title] [spacer] [Open source] [Delete] [Refresh title].
 * Deliberately omits model picker, mode toggle, system-prompt and resources
 * popovers — those moved into the run-chip + per-message More popover in the
 * retained spec.
 *
 * Delete-conversation reattaches the affordance that used to live inside the
 * legacy OpenMenuButton (orphaned by PR-Chat-1). PR-Chat-2 wires it to a
 * confirm modal using the PR-0 Modal primitive.
 *
 * The right-panel toggle that lived here previously was removed when the
 * Conversation Index moved out of the chat shell into a real Obsidian
 * right-sidebar ItemView (peak-conversation-outline-view). Obsidian's own
 * sidebar toggle is the canonical control now.
 */
export const Header: React.FC<HeaderProps> = () => {
	const strings = useChatStrings();
	const { manager, vaultNavigation } = useServiceContext();
	const activeConversation = useChatDataStore((s) => s.activeConversation);
	const activeProject = useChatDataStore((s) => s.activeProject);
	// Non-null only in Chat Studio when the right column is user-collapsed and
	// restorable (S5). Renders the PanelRight restore button; hidden otherwise.
	const restoreRight = useChatViewStore((s) => s.studioRestoreRight);
	const [isRegenerating, setIsRegenerating] = useState(false);
	const chatNavigation = useChatNavigation();
	// MSG-08 / Branch — resolve the parent conversation's title so the
	// "Branched from" chip shows something readable. The lookup is best-
	// effort; on failure we fall back to the id.
	const parentConversationId = activeConversation?.meta.parentConversationId ?? null;
	const [parentTitle, setParentTitle] = useState<string | null>(null);
	useEffect(() => {
		if (!parentConversationId) { setParentTitle(null); return; }
		let cancelled = false;
		void (async () => {
			try {
				const conv = await manager.readConversation(parentConversationId, false);
				if (!cancelled) setParentTitle(conv?.meta.title ?? parentConversationId);
			} catch {
				if (!cancelled) setParentTitle(parentConversationId);
			}
		})();
		return () => { cancelled = true; };
	}, [parentConversationId, manager]);

	if (!activeConversation) return null;

	const title = activeConversation.meta.title || activeConversation.meta.id;
	const hasSource = Boolean(activeConversation.file);
	const projectName = activeProject?.meta.name ?? null;

	const openParentConversation = async () => {
		if (!parentConversationId) return;
		try {
			const parent = await manager.readConversation(parentConversationId, true);
			if (!parent) return;
			await chatNavigation.openConversationInChat(parent, { loadMessages: false });
		} catch (err) {
			console.error('[Header] Open parent conversation failed:', err);
		}
	};

	const handleOpenSource = async () => {
		if (!activeConversation.file) return;
		await vaultNavigation.openSourceFile(activeConversation.file);
	};

	const handleRefresh = async () => {
		if (isRegenerating) return;
		setIsRegenerating(true);
		try {
			await manager.regenerateConversationTitle(activeConversation.meta.id);
		} catch (err) {
			console.error('[Header] Regenerate title failed:', err);
		} finally {
			setIsRegenerating(false);
		}
	};

	/*
	 * Per the locked retained-mock spec, header is title + 2 inline action
	 * icons (Open source + Refresh title). Delete used to live here but moved
	 * to the sidebar's right-click context menu — deleting the *currently
	 * open* conversation from its own header is a high-blast-radius action
	 * better discovered through the conversation list.
	 *
	 * No more __spacer pushing actions to the right edge; icons hug the
	 * truncated title for the compact look in the mock.
	 */
	return (
		<div className="pkchat-header">
			<div className="pkchat-header__titlewrap">
				<span className="pkchat-header__title" title={title}>{title}</span>
				{projectName && (
					<span
						className="pkchat-header__scope pktw-truncate pktw-max-w-[160px]"
						title={projectName}
					>
						{projectName}
					</span>
				)}
				{parentConversationId && (
					<Button
						variant="ghost"
						size="sm"
						className="pkchat-header__branch-chip"
						title={strings.message.branchedFromLabel.replace(
							'{title}',
							parentTitle ?? parentConversationId,
						)}
						onClick={openParentConversation}
					>
						<GitBranch className="pktw-w-3 pktw-h-3" />
						<span className="pktw-truncate pktw-max-w-[140px]">
							{strings.message.branchedFromLabel.replace(
								'{title}',
								parentTitle ?? parentConversationId,
							)}
						</span>
					</Button>
				)}
			</div>
			{/* SR: announce ONLY the final persisted title (typewriter is
			    display-only in the left column, so this fires once per
			    regeneration, not per character — §6.4/§7.2). */}
			<span aria-live="polite" className="pktw-sr-only">{title}</span>
			<div className="pkchat-header__actions">
				{hasSource && (
					<IconButton
						label={strings.header.openSourceLabel}
						title={strings.header.openSourceLabel}
						onClick={handleOpenSource}
					>
						<ExternalLink />
					</IconButton>
				)}
				<IconButton
					label={isRegenerating ? strings.header.refreshLabelBusy : strings.header.refreshLabel}
					title={isRegenerating ? strings.header.refreshLabelBusy : strings.header.refreshLabel}
					onClick={handleRefresh}
					disabled={isRegenerating}
				>
					<RefreshCw className={isRegenerating ? 'pktw-animate-spin' : undefined} />
				</IconButton>
				{restoreRight && (
					<IconButton
						label={strings.header.restoreRightLabel}
						title={strings.header.restoreRightLabel}
						data-peak-chat-restore-right
						onClick={restoreRight}
					>
						<PanelRight />
					</IconButton>
				)}
			</div>
		</div>
	);
};
