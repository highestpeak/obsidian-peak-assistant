import React, { useState, useRef, useEffect } from 'react';
import { Button } from '@/ui/component/shared-ui/button';
import { cn } from '@/ui/react/lib/utils';
import { CornerDownLeft, Loader2, Square, X, Mic, Send } from 'lucide-react';
import type { PromptInputStatus } from './types';
import { usePromptInputContext } from './PromptInput';

// Speech Recognition API types
interface SpeechRecognition extends EventTarget {
	continuous: boolean;
	interimResults: boolean;
	lang: string;
	start(): void;
	stop(): void;
	abort(): void;
	onstart: ((this: SpeechRecognition, ev: Event) => any) | null;
	onresult: ((this: SpeechRecognition, ev: SpeechRecognitionEvent) => any) | null;
	onerror: ((this: SpeechRecognition, ev: SpeechRecognitionErrorEvent) => any) | null;
	onend: ((this: SpeechRecognition, ev: Event) => any) | null;
}

interface SpeechRecognitionEvent extends Event {
	results: SpeechRecognitionResultList;
	resultIndex: number;
}

interface SpeechRecognitionErrorEvent extends Event {
	error: string;
	message: string;
}

interface SpeechRecognitionResultList {
	length: number;
	item(index: number): SpeechRecognitionResult;
	[index: number]: SpeechRecognitionResult;
}

interface SpeechRecognitionResult {
	length: number;
	item(index: number): SpeechRecognitionAlternative;
	[index: number]: SpeechRecognitionAlternative;
	isFinal: boolean;
}

interface SpeechRecognitionAlternative {
	transcript: string;
	confidence: number;
}

declare var SpeechRecognition: {
	new (): SpeechRecognition;
	prototype: SpeechRecognition;
} | undefined;

declare var webkitSpeechRecognition: {
	new (): SpeechRecognition;
	prototype: SpeechRecognition;
} | undefined;

export interface PromptInputSubmitProps {
	status?: PromptInputStatus;
	className?: string;
	disabled?: boolean;
	onCancel?: () => void | Promise<void>;
}

/**
 * Submit button component with voice input support
 */
export const PromptInputSubmit: React.FC<PromptInputSubmitProps> = ({
	status = 'ready',
	className,
	disabled,
	onCancel,
	...props
}) => {
	const { textInput } = usePromptInputContext();
	const [isRecording, setIsRecording] = useState(false);
	const recognitionRef = useRef<SpeechRecognition | null>(null);

	// Initialize speech recognition
	useEffect(() => {
		if (typeof window !== 'undefined') {
			const SpeechRecognitionClass = (window as any).SpeechRecognition || (window as any).webkitSpeechRecognition;
			if (SpeechRecognitionClass) {
				const recognition = new SpeechRecognitionClass() as SpeechRecognition;
				recognition.continuous = false; // Auto-stop when silence detected
				recognition.interimResults = false;
				recognition.lang = 'zh-CN'; // Default to Chinese, can be made configurable

				recognition.onstart = () => {
					setIsRecording(true);
				};

				recognition.onresult = (event: SpeechRecognitionEvent) => {
					// Get final transcript
					const transcript = Array.from(event.results)
						.map((result: SpeechRecognitionResult) => result[0].transcript)
						.join(' ');
					
					if (transcript.trim()) {
						// Append to existing text
						const currentText = textInput.value.trim();
						const newText = currentText ? `${currentText} ${transcript}` : transcript;
						textInput.setInput(newText);
					}
				};

				recognition.onerror = (event: SpeechRecognitionErrorEvent) => {
					console.error('Speech recognition error:', event.error);
					setIsRecording(false);
				};

				recognition.onend = () => {
					setIsRecording(false);
				};

				recognitionRef.current = recognition;
			}
		}

		return () => {
			if (recognitionRef.current) {
				recognitionRef.current.stop();
			}
		};
	}, [textInput]);

	// Determine icon based on status and input
	const hasInput = textInput.value.trim().length > 0;
	let Icon: React.ReactNode;

	if (status === 'submitted') {
		Icon = <Loader2 className="pktw-size-6 pktw-animate-spin" />;
	} else if (status === 'streaming') {
		Icon = <Square className="pktw-size-6" />;
	} else if (status === 'error') {
		Icon = <X className="pktw-size-6" />;
	} else if (hasInput) {
		// Show send icon when there's input
		Icon = <Send className="pktw-size-6" />;
	} else {
		// Show mic icon when no input
		Icon = <Mic className="pktw-size-6" />;
	}

	// Handle click: mic mode (start/stop recording) or submit/cancel
	const isStreaming = status === 'streaming';
	const handleClick = async (e: React.MouseEvent<HTMLButtonElement>) => {
		if (isStreaming && onCancel) {
			// Cancel streaming
			e.preventDefault();
			e.stopPropagation();
			await onCancel();
		} else if (!hasInput && recognitionRef.current) {
			// Toggle voice recording when no input
			e.preventDefault();
			e.stopPropagation();
			if (isRecording) {
				recognitionRef.current.stop();
			} else {
				try {
					recognitionRef.current.start();
				} catch (error) {
					console.error('Failed to start speech recognition:', error);
					setIsRecording(false);
				}
			}
		} else if (hasInput && isRecording && recognitionRef.current) {
			// Stop recording if user clicks send while recording
			e.preventDefault();
			e.stopPropagation();
			recognitionRef.current.stop();
		}
		// If has input, not recording, and not streaming, let the form submit naturally
	};

	// Determine button type and variant
	const buttonType = isStreaming ? 'button' : (hasInput ? 'submit' : 'button');
	
	// Use custom styling similar to assistant message tag style
	// Assistant messages typically use muted/accent background with subtle styling
	const buttonClassName = isStreaming
		? 'pktw-bg-destructive pktw-text-destructive-foreground hover:pktw-bg-destructive/90'
		: 'pktw-bg-muted pktw-text-muted-foreground hover:pktw-bg-accent hover:pktw-text-accent-foreground pktw-border pktw-border-border/50';

	return (
		<Button
			type={buttonType}
			variant="ghost"
			size="sm"
			className={cn(
				'pktw-h-10 pktw-w-10 pktw-rounded-md',
				buttonClassName,
				isRecording && 'pktw-animate-pulse',
				className
			)}
			disabled={disabled || (status === 'submitted' && !isStreaming)}
			onClick={handleClick}
			{...props}
		>
			{Icon}
		</Button>
	);
};

