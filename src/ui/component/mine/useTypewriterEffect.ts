import { useState, useEffect, useRef } from 'react';
import { TYPEWRITER_EFFECT_SPEED_MS } from '@/core/constant';

/**
 * Options for typewriter effect
 */
export interface UseTypewriterEffectOptions {
	/**
	 * Target text to display with typewriter effect
	 */
	text: string;
	/**
	 * Speed of typing in milliseconds per character
	 */
	speed?: number;
	/**
	 * Whether to enable the typewriter effect
	 */
	enabled?: boolean;
	/**
	 * Callback when typing is complete
	 */
	onComplete?: () => void;
}

/**
 * Hook that creates a typewriter effect for text
 * @returns Current displayed text with typewriter effect
 */
export function useTypewriterEffect({
	text,
	speed = TYPEWRITER_EFFECT_SPEED_MS,
	enabled = true,
	onComplete,
}: UseTypewriterEffectOptions): string {
	const [displayedText, setDisplayedText] = useState('');
	const [isTyping, setIsTyping] = useState(false);
	const timeoutRef = useRef<NodeJS.Timeout | null>(null);
	const previousTextRef = useRef<string>('');

	useEffect(() => {
		// Clear any existing timeout
		if (timeoutRef.current) {
			clearTimeout(timeoutRef.current);
		}

		// If text hasn't changed, don't restart typing
		if (text === previousTextRef.current) {
			return;
		}

		// If disabled or text is empty, set immediately
		if (!enabled || !text) {
			setDisplayedText(text);
			previousTextRef.current = text;
			return;
		}

		// If text changed, restart typing effect
		setDisplayedText('');
		setIsTyping(true);
		let currentIndex = 0;

		const typeNextChar = () => {
			if (currentIndex < text.length) {
				setDisplayedText(text.slice(0, currentIndex + 1));
				currentIndex++;
				timeoutRef.current = setTimeout(typeNextChar, speed);
			} else {
				setIsTyping(false);
				previousTextRef.current = text;
				onComplete?.();
			}
		};

		// Start typing with a small delay
		timeoutRef.current = setTimeout(typeNextChar, speed);

		return () => {
			if (timeoutRef.current) {
				clearTimeout(timeoutRef.current);
			}
		};
	}, [text, speed, enabled, onComplete]);

	// Cleanup on unmount
	useEffect(() => {
		return () => {
			if (timeoutRef.current) {
				clearTimeout(timeoutRef.current);
			}
		};
	}, []);

	return enabled ? displayedText : text;
}

