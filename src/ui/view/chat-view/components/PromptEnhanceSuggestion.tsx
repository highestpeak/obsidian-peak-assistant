import React, { useState, useEffect, useRef } from 'react';
import { Wand2, Loader2 } from 'lucide-react';
import { Button } from '@/ui/component/shared-ui/button';
import { usePromptInputContext } from '@/ui/component/prompt-input';
import { useServiceContext } from '@/ui/context/ServiceContext';
import { PromptId } from '@/service/prompt/PromptId';

const VAGUE_THRESHOLD = 20;

/**
 * Shows a subtle "Enhance prompt?" suggestion when the user's input is
 * vague or too short. Clicking rewrites the prompt via the PromptEnhance
 * template and replaces the input text.
 */
export const PromptEnhanceSuggestion: React.FC = () => {
	const { manager } = useServiceContext();
	const { textInput, focusInput } = usePromptInputContext();
	const [visible, setVisible] = useState(false);
	const [isEnhancing, setIsEnhancing] = useState(false);
	const [dismissed, setDismissed] = useState(false);
	const debounceRef = useRef<ReturnType<typeof setTimeout> | null>(null);

	const currentText = textInput.value;

	useEffect(() => {
		// Reset dismissed state when input changes significantly
		if (dismissed && currentText.trim().length === 0) {
			setDismissed(false);
		}

		if (debounceRef.current) clearTimeout(debounceRef.current);

		debounceRef.current = setTimeout(() => {
			const trimmed = currentText.trim();
			const shouldShow =
				!dismissed &&
				!isEnhancing &&
				trimmed.length > 0 &&
				trimmed.length < VAGUE_THRESHOLD &&
				!trimmed.startsWith('/') &&
				!trimmed.startsWith('@');
			setVisible(shouldShow);
		}, 800);

		return () => {
			if (debounceRef.current) clearTimeout(debounceRef.current);
		};
	}, [currentText, dismissed, isEnhancing]);

	if (!visible && !isEnhancing) return null;

	const handleEnhance = async () => {
		const originalText = textInput.value.trim();
		if (!originalText) return;

		setIsEnhancing(true);
		setVisible(false);

		try {
			const enhanced = await manager.queryText(
				PromptId.PromptEnhance,
				{ userPrompt: originalText },
			);
			const cleanEnhanced = enhanced.trim();
			if (cleanEnhanced && cleanEnhanced !== originalText) {
				textInput.setInput(cleanEnhanced);
				focusInput();
			}
		} catch (e) {
			console.warn('[PromptEnhanceSuggestion] Enhancement failed:', e);
		} finally {
			setIsEnhancing(false);
			setDismissed(true);
		}
	};

	const handleDismiss = () => {
		setVisible(false);
		setDismissed(true);
	};

	if (isEnhancing) {
		return (
			<div className="pktw-flex pktw-items-center pktw-gap-1.5 pktw-px-3 pktw-pb-1">
				<Loader2 className="pktw-w-3 pktw-h-3 pktw-animate-spin pktw-text-muted-foreground" />
				<span className="pktw-text-[11px] pktw-text-muted-foreground">Enhancing prompt...</span>
			</div>
		);
	}

	/*
	 * Render as an inline footnote-style row (not Button primitives) so the
	 * Enhance hint hugs the editor body without claiming an extra ~32px row
	 * of vertical space. Both affordances are accent-tinted anchor-style
	 * text — same visual class as the editor footnotes in the locked mock.
	 */
	return (
		<div
			className="pktw-flex pktw-items-center pktw-gap-2 pktw-px-3"
			style={{ paddingBottom: 4, paddingTop: 2, lineHeight: 1.2 }}
		>
			<a
				role="button"
				tabIndex={0}
				onClick={handleEnhance}
				onKeyDown={(e) => {
					if (e.key === 'Enter' || e.key === ' ') {
						e.preventDefault();
						handleEnhance();
					}
				}}
				className="pktw-cursor-pointer pktw-inline-flex pktw-items-center pktw-gap-1"
				style={{
					fontSize: 11,
					color: 'var(--pk-accent-text)',
					fontWeight: 500,
				}}
			>
				<Wand2 style={{ width: 11, height: 11 }} />
				<span>Enhance prompt?</span>
			</a>
			<a
				role="button"
				tabIndex={0}
				onClick={handleDismiss}
				onKeyDown={(e) => {
					if (e.key === 'Enter' || e.key === ' ') {
						e.preventDefault();
						handleDismiss();
					}
				}}
				className="pktw-cursor-pointer"
				style={{ fontSize: 11, color: 'var(--pk-text-tertiary)' }}
			>
				dismiss
			</a>
		</div>
	);
};
