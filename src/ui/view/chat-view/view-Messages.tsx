import React, { useEffect, useRef } from 'react';
import { useChatViewStore } from './store/chatViewStore';
import { useChatDataStore } from '@/ui/store/chatDataStore';
import { OpenLinkEvent, ViewEventType } from '@/core/eventBus';
import { MessageListRendererRetained } from './components/messages/MessageListRendererRetained';
import { FileChangesList } from './components/messages/FileChangesList';
import { ConvertToProjectSuggestion } from './components/ConvertToProjectSuggestion';
import { HeaderRetained } from './components/HeaderRetained';
import { ComposerRetained } from './components/ComposerRetained';

import { useServiceContext } from '@/ui/context/ServiceContext';
import { useScrollManager, scrollToBottom as scrollToBottomUtil } from '../shared/scroll-utils';
import { useAutoScroll } from './hooks/useAutoScroll';
import { IconButton } from '@/ui/components/primitives';
import { ArrowUp, ArrowDown } from 'lucide-react';
import { NewConversationTypePicker } from './components/NewConversationTypePicker';
import { ChatStringsProvider } from './chatStringsContext';

/**
 * Messages view — the retained chat surface (header + body + composer).
 *
 * Shell layout per the 2026-05-29 retained mock:
 *   .pkchat-shell  (peak-design-root scoped)
 *     └─ .pkchat-center
 *          ├─ HeaderRetained        ← title + Open source + Refresh
 *          ├─ .pkchat-body          ← scrollable message list (existing renderer)
 *          ├─ scroll-to-top/bottom affordances
 *          └─ ComposerRetained      ← input capsule + run-chip + send
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
	const { app, eventBus } = useServiceContext();
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

	const { scrollToTop, scrollToBottom } = useScrollManager({
		scrollRef: bodyScrollRef,
		containerRef: bodyScrollRef,
		eventBus,
		autoScrollOnMessagesChange: true,
		messagesCount: activeConversation?.messages.length,
		autoScrollOnStreaming: false,
	});

	const { resumeAutoScroll } = useAutoScroll({
		scrollRef: bodyScrollRef,
		enabled: true,
		userScrollThreshold: 100,
	});

	useEffect(() => {
		if (!eventBus) return;
		const unsubscribeOpenLink = eventBus.on<OpenLinkEvent>(
			ViewEventType.OPEN_LINK,
			async (event) => {
				await app.workspace.openLinkText(event.path, '', true);
			}
		);
		return () => {
			unsubscribeOpenLink();
		};
	}, [eventBus, app]);

	useEffect(() => {
		if (!activeConversation) return;
		scrollToBottomUtil(bodyScrollRef, true);
	}, [activeConversation?.meta.id]);

	// Pre-conversation placeholders (pending picker / empty hero) preserve
	// the existing UX while we're not yet wiring the retained chrome to those
	// states. Once a conversation exists, we render the full retained shell.
	if (!activeConversation || pendingConversation) {
		return (
			<div className="peak-design-root pkchat-shell">
				<div className="pkchat-center">
					<div
						className="pktw-flex pktw-items-center pktw-justify-center pktw-h-full pktw-min-h-[400px]"
					>
						{pendingConversation ? (
							<NewConversationTypePicker
								selectedKind={pendingConversation.conversationType?.kind ?? 'chat'}
								onSelectType={(type) => {
									useChatViewStore.getState().setPendingConversation({
										...pendingConversation,
										conversationType: type,
									});
								}}
							/>
						) : (
							<span className="pktw-text-2xl pktw-font-light pktw-text-muted-foreground pktw-text-center">
								Ready when you are.
							</span>
						)}
					</div>
				</div>
			</div>
		);
	}

	return (
		<div className="peak-design-root pkchat-shell">
			<div className="pkchat-center">
				<HeaderRetained />

				<div
					ref={bodyScrollRef}
					className="pkchat-body"
					style={{ scrollBehavior: 'smooth' }}
				>
					{/*
					  PR-Chat-2: document-style message rendering lives inside
					  <MessageListRendererRetained />. It supersedes the legacy
					  MessageListRenderer + MessageViewItem pair (now removed).
					*/}
					<MessageListRendererRetained />
					<FileChangesList />
				</div>

				<ConvertToProjectSuggestion />

				<div className="pktw-flex-shrink-0 pktw-flex pktw-justify-end pktw-items-center pktw-px-6 pktw-pt-2">
					<div className="pktw-flex pktw-items-center pktw-gap-1">
						<IconButton
							label="Scroll to top"
							title="Scroll to top"
							onClick={() => scrollToTop(false)}
						>
							<ArrowUp />
						</IconButton>
						<IconButton
							label="Scroll to latest"
							title="Scroll to latest"
							onClick={() => {
								scrollToBottom(true);
								resumeAutoScroll();
							}}
						>
							<ArrowDown />
						</IconButton>
					</div>
				</div>

				<ComposerRetained />
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
