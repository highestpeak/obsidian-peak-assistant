import React, { useCallback, useRef, useState } from 'react';
import { useChatViewStore } from '../../store/chatViewStore';
import { useChatStrings } from '../../chatStringsContext';

/**
 * MessageInlineFollowup — small inline composer rendered under a message
 * when the user explicitly enables "Reply inline" via the More popover.
 *
 * NOTE: the message store does not currently support threaded follow-ups —
 * the submitted text is sent as a regular next-turn message via the chat
 * view store's submitAction. PR-Chat-3+ may upgrade to true threading once
 * the message model supports a parent-id field.
 */
export interface MessageInlineFollowupProps {
	onClose: () => void;
}

export const MessageInlineFollowup: React.FC<MessageInlineFollowupProps> = ({ onClose }) => {
	const strings = useChatStrings();
	const [value, setValue] = useState('');
	const textareaRef = useRef<HTMLTextAreaElement>(null);

	React.useEffect(() => {
		textareaRef.current?.focus();
	}, []);

	const handleSubmit = useCallback(() => {
		const text = value.trim();
		if (!text) return;
		const submit = useChatViewStore.getState().submitAction;
		if (submit) submit(text);
		setValue('');
		onClose();
	}, [value, onClose]);

	const handleKeyDown = useCallback(
		(e: React.KeyboardEvent<HTMLTextAreaElement>) => {
			if (e.key === 'Enter' && (e.metaKey || e.ctrlKey)) {
				e.preventDefault();
				handleSubmit();
			} else if (e.key === 'Escape') {
				e.preventDefault();
				onClose();
			}
		},
		[handleSubmit, onClose]
	);

	return (
		<div className="pkchat-msg__inline-followup">
			<div className="pkchat-msg__inline-followup__head">
				<span>{strings.message.inlineFollowupHint}</span>
			</div>
			<textarea
				ref={textareaRef}
				className="pkchat-msg__inline-followup__textarea"
				placeholder={strings.message.inlineFollowupPlaceholder}
				value={value}
				onChange={(e) => setValue(e.target.value)}
				onKeyDown={handleKeyDown}
			/>
			<div className="pkchat-msg__inline-followup__actions">
				<button
					type="button"
					className="pkchat-msg__inline-followup__cancel"
					onClick={onClose}
				>
					{strings.message.inlineFollowupCancel}
				</button>
				<button
					type="button"
					className="pkchat-msg__inline-followup__submit"
					disabled={value.trim().length === 0}
					onClick={handleSubmit}
				>
					{strings.message.inlineFollowupSubmit}
				</button>
			</div>
		</div>
	);
};
