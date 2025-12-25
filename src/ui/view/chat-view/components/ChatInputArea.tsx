import React, { useState, useRef, useEffect } from 'react';
import { useProjectStore } from '@/ui/store/projectStore';
import { useChatSubmit } from '../hooks/useChatSubmit';
import {
	PromptInput,
	PromptInputProvider,
	PromptInputHeader,
	PromptInputBody,
	PromptInputFooter,
	PromptInputTextarea,
	PromptInputSubmit,
	PromptInputTools,
	PromptInputAttachments,
	PromptInputAttachment,
	PromptInputActionMenu,
	PromptInputActionMenuTrigger,
	PromptInputActionMenuContent,
	PromptInputActionAddAttachments,
} from '@/ui/component/ai-elements';
import { ChatModelSelector } from './ChatModelSelector';

interface ChatInputAreaComponentProps {
	onScrollToBottom?: () => void;
}

/**
 * React component for chat input area using PromptInput from ai-elements
 */
export const ChatInputAreaComponent: React.FC<ChatInputAreaComponentProps> = ({
	onScrollToBottom,
}) => {
	const activeConversation = useProjectStore((state) => state.activeConversation);
	const [isSending, setIsSending] = useState(false);
	const textareaRef = useRef<HTMLTextAreaElement>(null);

	// Use chat submit hook
	const { handleSubmit } = useChatSubmit({
		onScrollToBottom,
		onSendingChange: setIsSending,
	});

	// Clear input when conversation changes
	useEffect(() => {
		if (textareaRef.current) {
			setTimeout(() => {
				textareaRef.current?.focus();
			}, 100);
		}
	}, [activeConversation?.meta.id]);

	// Handle keyboard shortcuts (Cmd/Ctrl+K to focus input)
	useEffect(() => {
		const handleKeyDown = (e: KeyboardEvent) => {
			const isModKey = e.metaKey || e.ctrlKey;
			const isKKey = e.key === 'k' || e.key === 'K' || e.keyCode === 75;

			if (isModKey && isKKey) {
				const activeElement = document.activeElement;
				if (textareaRef.current && activeElement !== textareaRef.current) {
					e.preventDefault();
					e.stopPropagation();
					e.stopImmediatePropagation();
					setTimeout(() => {
						textareaRef.current?.focus();
					}, 100);
					return false;
				}
			}
		};

		window.addEventListener('keydown', handleKeyDown, true);
		return () => {
			window.removeEventListener('keydown', handleKeyDown, true);
		};
	}, []);

	const hasMessages = activeConversation && activeConversation.messages.length > 0;
	const placeholder = hasMessages ? 'Ask anything' : 'Ready when you are.';

	return (
		<div className="pktw-px-6 pktw-pt-5 pktw-pb-6 pktw-border-t pktw-border-border pktw-flex-shrink-0">
			<PromptInputProvider>
				<PromptInput globalDrop multiple onSubmit={handleSubmit}>
					<PromptInputHeader>
						<PromptInputAttachments>
							{(attachment) => <PromptInputAttachment data={attachment} />}
						</PromptInputAttachments>
					</PromptInputHeader>
					<PromptInputBody>
						<PromptInputTextarea
							ref={textareaRef}
							placeholder={placeholder}
							name="message"
						/>
					</PromptInputBody>
					<PromptInputFooter>
						<PromptInputTools>
							<PromptInputActionMenu>
								<PromptInputActionMenuTrigger />
								<PromptInputActionMenuContent>
									<PromptInputActionAddAttachments />
								</PromptInputActionMenuContent>
							</PromptInputActionMenu>
							<ChatModelSelector />
						</PromptInputTools>
						<PromptInputSubmit status={isSending ? 'streaming' : 'ready'} />
					</PromptInputFooter>
				</PromptInput>
			</PromptInputProvider>
		</div>
	);
};
