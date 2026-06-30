import React, { useEffect, useRef } from 'react';
import { useChatViewStore } from './store/chatViewStore';
import { useChatDataStore } from '@/ui/store/chatDataStore';
import { OpenLinkEvent, ViewEventType } from '@/core/eventBus';
import { MessageListRenderer } from './components/messages/MessageListRenderer';
import { ConvertToProjectSuggestion } from './components/ConvertToProjectSuggestion';
import { Header } from './components/Header';
import { Composer } from './components/Composer';

import { useServiceContext } from '@/ui/context/ServiceContext';
import { useScrollManager, scrollToBottom as scrollToBottomUtil } from '../shared/scroll-utils';
import { useAutoScroll } from './hooks/useAutoScroll';
import { NewConversationTypePicker } from './components/NewConversationTypePicker';
import { ChatStringsProvider } from './chatStringsContext';

/**
 * Messages view — the retained chat surface (header + body + composer).
 *
 * Shell layout per the 2026-05-29 retained mock:
 *   .pkchat-shell  (peak-design-root scoped)
 *     └─ .pkchat-center
 *          ├─ Header        ← title + Open source + Refresh
 *          ├─ .pkchat-body          ← scrollable message list (existing renderer)
 *          ├─ scroll-to-top/bottom affordances
 *          └─ Composer      ← input capsule + run-chip + send
 *
 * The 4-tab Conversation Index no longer lives inside this shell — it was
 * promoted to a dedicated Obsidian right-sidebar ItemView
 * (peak-conversation-outline-view) so it shares space and behavior with
 * other sidebar panels. See @/ui/view/ConversationOutlineView.
 *
 * Service/business logic (orchestrator, providers, streaming, context builder)
 * is intentionally NOT touched — only the UI chrome is being rebuilt here.
 */
/**
 * Wrapper that mounts ChatStringsProvider once at the chat-view root so every
 * descendant can read template-overridable strings via `useChatStrings()`.
 * Kept as a thin outer shell so the (busy) inner component stays focused on
 * scroll / streaming / shell layout.
 */
export const MessagesViewComponent: React.FC = () => (
	<ChatStringsProvider>
		<MessagesViewInner />
	</ChatStringsProvider>
);

const MessagesViewInner: React.FC = () => {
	const { eventBus, vaultNavigation } = useServiceContext();
	const pendingConversation = useChatViewStore().pendingConversation;
	const activeConversation = useChatDataStore((state) => state.activeConversation);

	// Sync messages from activeConversation to messageStore
	const { setMessages, clearMessages } = useChatDataStore();
	const activeMessages = activeConversation?.messages;
	useEffect(() => {
		if (activeMessages && activeMessages.length > 0) {
			setMessages(activeMessages);
		} else if (!activeConversation) {
			clearMessages();
		}
	}, [activeConversation, activeMessages, setMessages, clearMessages]);

	// Scroll management — kept identical to pre-refactor behavior
	const bodyScrollRef = useRef<HTMLDivElement>(null);

	// Hook called for its auto-scroll-on-message-change side effect.
	// scrollToTop / scrollToBottom returns are unused since the explicit
	// scroll buttons were removed (see render block below).
	useScrollManager({
		scrollRef: bodyScrollRef,
		containerRef: bodyScrollRef,
		eventBus,
		autoScrollOnMessagesChange: true,
		messagesCount: activeConversation?.messages.length,
		autoScrollOnStreaming: false,
	});

	useAutoScroll({
		scrollRef: bodyScrollRef,
		enabled: true,
		userScrollThreshold: 100,
	});

	useEffect(() => {
		if (!eventBus) return;
		const unsubscribeOpenLink = eventBus.on<OpenLinkEvent>(
			ViewEventType.OPEN_LINK,
			async (event) => {
				await vaultNavigation.openLink(event.path, { newLeaf: true });
			}
		);
		return () => {
			unsubscribeOpenLink();
		};
	}, [eventBus, vaultNavigation]);

	useEffect(() => {
		if (!activeConversation) return;
		scrollToBottomUtil(bodyScrollRef, true);
	}, [activeConversation?.meta.id]);

	// Pending state: picker + composer in a single centered stack so the eye
	// reads "pick mode → type message" as one block. Composer is NOT pinned
	// to the bottom in this state (that left ~half a screen of empty space
	// between picker and composer — picker and composer read as two
	// unrelated UI islands). Once a real conversation exists the composer
	// snaps back to its bottom-docked position via the active-conversation
	// branch below.
	if (pendingConversation) {
		return (
			<div className="peak-design-root pkchat-shell">
				<div className="pkchat-center">
					<div className="pkchat-body pktw-flex pktw-flex-col pktw-items-center pktw-justify-center pktw-gap-3">
						<NewConversationTypePicker
							selectedKind={pendingConversation.conversationType?.kind ?? 'chat'}
							onSelectType={(type) => {
								useChatViewStore.getState().setPendingConversation({
									...pendingConversation,
									conversationType: type,
								});
							}}
						/>
						<div className="pktw-w-full pktw-max-w-[760px]">
							<Composer />
						</div>
					</div>
				</div>
			</div>
		);
	}

	// No active and no pending conversation — empty hero.
	if (!activeConversation) {
		return (
			<div className="peak-design-root pkchat-shell">
				<div className="pkchat-center">
					<div className="pktw-flex pktw-items-center pktw-justify-center pktw-h-full pktw-min-h-[400px]">
						<span className="pktw-text-2xl pktw-font-light pktw-text-muted-foreground pktw-text-center">
							Ready when you are.
						</span>
					</div>
				</div>
			</div>
		);
	}

	return (
		<div className="peak-design-root pkchat-shell">
			<div className="pkchat-center">
				<Header />

				<div
					ref={bodyScrollRef}
					className="pkchat-body"
					style={{ scrollBehavior: 'smooth' }}
				>
					{/*
					  PR-Chat-2: document-style message rendering lives inside
					  <MessageListRenderer />. It supersedes the legacy
					  MessageListRenderer + MessageViewItem pair (now removed).
					*/}
					<MessageListRenderer />
				</div>

				<ConvertToProjectSuggestion />

				{/*
				  Scroll-to-top / Scroll-to-bottom IconButtons removed —
				  not in the retained-mock spec; sat awkwardly between body
				  and composer. Native scroll plus auto-scroll-on-stream cover
				  the same need. If we re-add these, they belong as a floating
				  affordance overlay on the right edge of the body, not as a
				  full-width row that fights composer for vertical space.
				*/}

				<Composer />
			</div>

			{/*
			  The Conversation Outline (4-tab index) lives in Obsidian's right
			  sidebar as a dedicated ItemView (peak-conversation-outline-view),
			  auto-mounted by ViewSwitchConsistentHandler.activateChatView().
			  No in-shell right slot anymore.
			*/}
		</div>
	);
};
