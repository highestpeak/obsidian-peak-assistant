import { RefObject, useCallback, useEffect, useRef, useState } from 'react';
import { ScrollToMessageEvent, ViewEventType } from '@/core/eventBus';
import type { EventBus } from '@/core/eventBus';

/**
 * Options for scroll to message
 */
export interface ScrollToMessageOptions {
	/**
	 * Container ref that contains message elements
	 */
	containerRef: RefObject<HTMLElement>;
	/**
	 * Message ID to scroll to
	 */
	messageId: string;
	/**
	 * Maximum retry attempts if message not found
	 */
	attempts?: number;
	/**
	 * Whether to highlight the message after scrolling
	 */
	highlight?: boolean;
	/**
	 * Highlight duration in milliseconds
	 */
	highlightDuration?: number;
	/**
	 * Scroll behavior: 'smooth' or 'auto'
	 */
	behavior?: ScrollBehavior;
	/**
	 * Block position for scrollIntoView
	 */
	block?: ScrollLogicalPosition;
}

/**
 * Scroll to top of scroll container
 * @param scrollRef - Ref to scrollable container
 * @param instant - Whether to scroll instantly without animation
 */
export function scrollToTop(scrollRef: RefObject<HTMLElement>, instant: boolean = false): void {
	if (!scrollRef.current) return;
	if (instant) {
		scrollRef.current.scrollTop = 0;
		return;
	}
	// Double requestAnimationFrame ensures browser has completed all rendering
	requestAnimationFrame(() => {
		requestAnimationFrame(() => {
			scrollRef.current?.scrollTo({
				top: 0,
				behavior: 'smooth',
			});
		});
	});
}

/**
 * Scroll to bottom of scroll container
 * @param scrollRef - Ref to scrollable container
 * @param instant - Whether to scroll instantly without animation
 */
export function scrollToBottom(scrollRef: RefObject<HTMLElement>, instant: boolean = false): void {
	if (!scrollRef.current) return;
	
	if (instant) {
		const scrollElement = scrollRef.current;
		let lastScrollHeight = 0;
		let attempts = 0;
		const maxAttempts = 10; // Maximum number of scroll attempts
		
		// Function to attempt scrolling - keeps trying until scrollHeight stabilizes
		const attemptScroll = () => {
			if (!scrollElement || attempts >= maxAttempts) return;
			
			const currentScrollHeight = scrollElement.scrollHeight;
			scrollElement.scrollTop = currentScrollHeight;
			
			// If scrollHeight changed, content is still loading, try again
			if (currentScrollHeight !== lastScrollHeight) {
				lastScrollHeight = currentScrollHeight;
				attempts++;
				// Use increasing delays to allow content to load (code blocks, images, etc.)
				setTimeout(attemptScroll, Math.min(attempts * 50, 300));
			}
		};
		
		// Start scrolling after initial render
		requestAnimationFrame(() => {
			requestAnimationFrame(() => {
				attemptScroll();
			});
		});
		return;
	}
	
	// Double requestAnimationFrame ensures browser has completed all rendering
	// This is especially important for scrollHeight calculation when content is dynamic
	requestAnimationFrame(() => {
		requestAnimationFrame(() => {
			if (!scrollRef.current) return;
			scrollRef.current.scrollTo({
				top: scrollRef.current.scrollHeight,
				behavior: 'smooth',
			});
		});
	});
}

/**
 * Scroll to a specific message element
 * @param options - Scroll options
 */
export function scrollToMessage(options: ScrollToMessageOptions): void {
	const {
		containerRef,
		messageId,
		attempts = 3,
		highlight = true,
		highlightDuration = 800,
		behavior = 'smooth',
		block = 'center',
	} = options;

	if (!containerRef.current) return;

	const messageEl = containerRef.current.querySelector(
		`[data-message-id="${messageId}"]`
	) as HTMLElement;

	if (messageEl) {
		messageEl.scrollIntoView({ behavior, block });

		if (highlight) {
			// Wait for scroll and DOM update, then apply highlight
			requestAnimationFrame(() => {
				requestAnimationFrame(() => {
					// Determine highlight color based on message role
					const messageRole = messageEl.getAttribute('data-message-role');
					const isUserMessage = messageRole === 'user';

					// User messages use red outline, assistant messages use accent color
					const outlineClasses = isUserMessage
						? [
								'pktw-outline',
								'pktw-outline-2',
								'pktw-outline-red-500',
								'pktw-outline-offset-0',
						  ]
						: [
								'pktw-outline',
								'pktw-outline-2',
								'pktw-outline-[var(--interactive-accent)]',
								'pktw-outline-offset-0',
						  ];

					// Try to find message bubble first, otherwise highlight the message element itself
					const messageBubble = messageEl.querySelector(
						'[data-message-bubble]'
					) as HTMLElement;
					const targetElement = messageBubble || messageEl;

					targetElement.classList.add(...outlineClasses);
					setTimeout(() => {
						targetElement.classList.remove(...outlineClasses);
					}, highlightDuration);
				});
			});
		}
		return;
	}

	// Retry if message not found
	if (attempts > 0) {
		setTimeout(() => {
			scrollToMessage({
				...options,
				attempts: attempts - 1,
			});
		}, 60);
	}
}

/**
 * Options for useScrollManager hook
 */
export interface UseScrollManagerOptions {
	/**
	 * Ref to scrollable container
	 */
	scrollRef: RefObject<HTMLElement>;
	/**
	 * Ref to container that contains message elements
	 */
	containerRef: RefObject<HTMLElement>;
	/**
	 * Event bus instance
	 */
	eventBus?: EventBus;
	/**
	 * Whether to auto scroll to bottom when messages count changes
	 */
	autoScrollOnMessagesChange?: boolean;
	/**
	 * Messages count to watch for changes
	 */
	messagesCount?: number;
	/**
	 * Whether to auto scroll to bottom when streaming content changes
	 */
	autoScrollOnStreaming?: boolean;
	/**
	 * Streaming content to watch for changes
	 */
	streamingContent?: string;
}

/**
 * Hook to manage scroll behavior for message views
 * Handles scroll to top, bottom, message, and auto-scroll on content changes
 */
export function useScrollManager(options: UseScrollManagerOptions) {
	const {
		scrollRef,
		containerRef,
		eventBus,
		autoScrollOnMessagesChange = false,
		messagesCount,
		autoScrollOnStreaming = false,
		streamingContent,
	} = options;

	const [pendingScrollMessageId, setPendingScrollMessageId] = useState<string | null>(null);

	// Scroll functions
	const handleScrollToTop = useCallback(
		(instant: boolean = false) => {
			scrollToTop(scrollRef, instant);
		},
		[scrollRef]
	);

	const handleScrollToBottom = useCallback(
		(instant: boolean = false) => {
			scrollToBottom(scrollRef, instant);
		},
		[scrollRef]
	);

	const handleScrollToMessage = useCallback(
		(messageId: string) => {
			scrollToMessage({
				containerRef,
				messageId,
				highlight: true,
			});
		},
		[containerRef]
	);

	// Listen to scroll to message events
	useEffect(() => {
		if (!eventBus) return;

		const unsubscribeScroll = eventBus.on<ScrollToMessageEvent>(
			ViewEventType.SCROLL_TO_MESSAGE,
			(event) => {
				setPendingScrollMessageId(event.messageId);
			}
		);

		return () => {
			unsubscribeScroll();
		};
	}, [eventBus]);

	// Apply pending scroll when message is available
	useEffect(() => {
		if (!pendingScrollMessageId) return;

		// Wait for message to render, then scroll
		requestAnimationFrame(() => {
			requestAnimationFrame(() => {
				handleScrollToMessage(pendingScrollMessageId);
				setPendingScrollMessageId(null);
			});
		});
	}, [pendingScrollMessageId, handleScrollToMessage]);

	// Auto scroll to bottom when messages count changes
	useEffect(() => {
		if (!autoScrollOnMessagesChange || messagesCount === undefined) return;
		if (messagesCount > 0) {
			handleScrollToBottom();
		}
	}, [messagesCount, autoScrollOnMessagesChange, handleScrollToBottom]);

	// Auto scroll to bottom when streaming content changes
	useEffect(() => {
		if (!autoScrollOnStreaming || !streamingContent) return;
		handleScrollToBottom();
	}, [streamingContent, autoScrollOnStreaming, handleScrollToBottom]);

	return {
		scrollToTop: handleScrollToTop,
		scrollToBottom: handleScrollToBottom,
		scrollToMessage: handleScrollToMessage,
	};
}
