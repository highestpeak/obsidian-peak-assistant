import { useEffect, useRef, useCallback } from 'react';
import { useMessageStore } from '../store/messageStore';
import { scrollToBottom } from '../../shared/scroll-utils';

/**
 * Options for useAutoScroll hook
 */
export interface UseAutoScrollOptions {
	/**
	 * Ref to scrollable container
	 */
	scrollRef: React.RefObject<HTMLElement>;
	/**
	 * Whether auto-scroll is enabled
	 */
	enabled?: boolean;
	/**
	 * Threshold for detecting user scroll (pixels from bottom)
	 */
	userScrollThreshold?: number;
}

/**
 * Hook to automatically scroll to bottom when streaming content changes,
 * but pause auto-scroll when user manually scrolls up
 */
export function useAutoScroll(options: UseAutoScrollOptions) {
	const { scrollRef, enabled = true, userScrollThreshold = 100 } = options;

	// Track if auto-scroll is paused due to user interaction
	const autoScrollPausedRef = useRef(false);
	// Track last known scroll height to detect user scroll direction
	const lastScrollHeightRef = useRef(0);
	// Track if we're currently in a scroll event to avoid recursive calls
	const isScrollingRef = useRef(false);
	// Track last scroll time for throttling
	const lastScrollTimeRef = useRef(0);
	const SCROLL_THROTTLE_MS = 300; // Throttle auto-scroll to prevent overwhelming user

	/**
	 * Check if user has scrolled away from the bottom
	 */
	const checkUserScroll = useCallback(() => {
		if (!scrollRef.current || isScrollingRef.current) return;

		const element = scrollRef.current;
		const scrollTop = element.scrollTop;
		const scrollHeight = element.scrollHeight;
		const clientHeight = element.clientHeight;

		// Calculate how far from bottom the user is
		const distanceFromBottom = scrollHeight - scrollTop - clientHeight;

		// If user is significantly away from bottom, pause auto-scroll
		// This is more reliable than tracking scroll direction
		if (distanceFromBottom > userScrollThreshold) {
			if (!autoScrollPausedRef.current) {
				console.debug('[useAutoScroll] User scrolled away from bottom, pausing auto-scroll');
				autoScrollPausedRef.current = true;
			}
		}
		// Only resume auto-scroll if user is very close to bottom
		else if (distanceFromBottom <= 20) { // Much stricter threshold to resume
			if (autoScrollPausedRef.current) {
				console.debug('[useAutoScroll] User scrolled back to bottom, resuming auto-scroll');
				autoScrollPausedRef.current = false;
			}
		}

		lastScrollHeightRef.current = scrollTop;
	}, [scrollRef, userScrollThreshold]);

	/**
	 * Scroll to bottom if auto-scroll is not paused, with throttling
	 */
	const scrollToBottomIfEnabled = useCallback(() => {
		if (!enabled || autoScrollPausedRef.current || !scrollRef.current) return;

		const now = Date.now();
		if (now - lastScrollTimeRef.current < SCROLL_THROTTLE_MS) return; // Throttle
		lastScrollTimeRef.current = now;

		isScrollingRef.current = true;
		scrollToBottom(scrollRef, false); // false = smooth scroll

		// Reset scrolling flag after animation
		setTimeout(() => {
			isScrollingRef.current = false;
		}, 300);
	}, [enabled, scrollRef]);

	// Listen for scroll events to detect user interaction
	useEffect(() => {
		const element = scrollRef.current;
		if (!element) return;

		const handleScroll = () => {
			checkUserScroll();
		};

		element.addEventListener('scroll', handleScroll, { passive: true });
		return () => {
			element.removeEventListener('scroll', handleScroll);
		};
	}, [scrollRef, checkUserScroll]);

	// Listen for streaming content changes
	useEffect(() => {
		if (!enabled) return;

		let previousState = {
			streamingContent: useMessageStore.getState().streamingContent,
			reasoningContent: useMessageStore.getState().reasoningContent,
			currentToolCalls: useMessageStore.getState().currentToolCalls.length,
			isStreaming: !!useMessageStore.getState().streamingMessageId,
		};

		const unsubscribe = useMessageStore.subscribe((currentState) => {
			const current = {
				streamingContent: currentState.streamingContent,
				reasoningContent: currentState.reasoningContent,
				currentToolCalls: currentState.currentToolCalls.length,
				isStreaming: !!currentState.streamingMessageId,
			};

			// Only trigger scroll if actively streaming
			if (!current.isStreaming) {
				previousState = current;
				return;
			}

			// Trigger scroll if any streaming-related state changed
			const contentChanged =
				current.streamingContent !== previousState.streamingContent ||
				current.reasoningContent !== previousState.reasoningContent ||
				current.currentToolCalls !== previousState.currentToolCalls;

			// Only scroll if there's actual content change and not just empty additions
			if (contentChanged) {
				// For tool calls, always scroll (important milestones)
				if (current.currentToolCalls !== previousState.currentToolCalls) {
					scrollToBottomIfEnabled();
				}
				// For content changes, only scroll if there's meaningful content
				else if (current.streamingContent.length > 0 || current.reasoningContent.length > 0) {
					scrollToBottomIfEnabled();
				}
			}

			previousState = current;
		});

		return unsubscribe;
	}, [enabled, scrollToBottomIfEnabled]);

	/**
	 * Manually resume auto-scroll (useful when user clicks scroll-to-bottom button)
	 */
	const resumeAutoScroll = useCallback(() => {
		autoScrollPausedRef.current = false;
		scrollToBottomIfEnabled();
	}, [scrollToBottomIfEnabled]);

	/**
	 * Check if auto-scroll is currently paused
	 */
	const isAutoScrollPaused = useCallback(() => autoScrollPausedRef.current, []);

	return {
		resumeAutoScroll,
		isAutoScrollPaused,
		scrollToBottomIfEnabled,
	};
}