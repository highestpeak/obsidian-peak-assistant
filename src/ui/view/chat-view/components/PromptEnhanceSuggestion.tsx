import React, { useState, useEffect, useRef } from 'react';
import { Wand2, Loader2 } from 'lucide-react';
import { Button } from '@/ui/component/shared-ui/button';
import { usePromptInputContext } from '@/ui/component/prompt-input';
import { AppContext } from '@/app/context/AppContext';
import { PromptId } from '@/service/prompt/PromptId';

const VAGUE_THRESHOLD = 20;

/**
 * Shows a subtle "Enhance prompt?" suggestion when the user's input is
 * vague or too short. Clicking rewrites the prompt via the PromptEnhance
 * template and replaces the input text.
 */
export const PromptEnhanceSuggestion: React.FC = () => {
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
			const manager = AppContext.getInstance().manager;
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
			<div className="pktw-flex pktw-items-center pktw-gap-1.5 pktw-px-3 pktw-py-1">
				<Loader2 className="pktw-w-3 pktw-h-3 pktw-animate-spin pktw-text-muted-foreground" />
				<span className="pktw-text-[11px] pktw-text-muted-foreground">Enhancing prompt...</span>
			</div>
		);
	}

	return (
		<div className="pktw-flex pktw-items-center pktw-gap-1 pktw-px-3 pktw-py-1">
			<Button
				variant="ghost"
				size="sm"
				className="pktw-h-6 pktw-text-[11px] pktw-text-muted-foreground hover:pktw-text-accent pktw-gap-1 pktw-px-2"
				onClick={handleEnhance}
			>
				<Wand2 className="pktw-w-3 pktw-h-3" />
				Enhance prompt?
			</Button>
			<Button
				variant="ghost"
				size="sm"
				className="pktw-h-6 pktw-text-[10px] pktw-text-muted-foreground/50 pktw-px-1"
				onClick={handleDismiss}
			>
				dismiss
			</Button>
		</div>
	);
};
