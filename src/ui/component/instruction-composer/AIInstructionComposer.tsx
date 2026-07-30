import * as React from 'react';
import { ArrowUp, Paperclip, Square } from 'lucide-react';
import {
	createAIInstructionSubmission,
	type AIInstructionAttachmentRef,
	type AIInstructionContextRef,
	type AIInstructionRunStatus,
	type AIInstructionSubmission,
	type AIInstructionSurface,
} from '@/core/instruction-composer';
import {
	PromptInput,
	PromptInputAttachments,
	PromptInputBody,
	type PromptInputEditorHandle,
	usePromptInputContext,
} from '@/ui/component/prompt-input';
import { Button } from '@/ui/component/shared-ui/button';
import type { NavigableMenuItem } from '@/ui/component/mine/NavigableMenu';

export interface AIInstructionComposerProps {
	surface: AIInstructionSurface;
	capabilityId: string;
	value: string;
	onValueChange(value: string): void;
	onSubmit(submission: AIInstructionSubmission): void | Promise<void>;
	onStop?(): void | Promise<void>;
	status?: AIInstructionRunStatus;
	placeholder: string;
	context?: readonly AIInstructionContextRef[];
	contextItems?: NavigableMenuItem[];
	onLoadContextItems?: (query: string, currentFolder?: string) => Promise<NavigableMenuItem[]>;
	onMenuItemSelect?: (triggerChar: string, selectedItem: NavigableMenuItem, resolvedText?: string) => void;
	compact?: boolean;
	autoFocus?: boolean;
	trailingControls?: React.ReactNode;
}

/**
 * Shared product-level AI instruction surface. PromptInput owns attachment,
 * trigger, IME and editor behavior; this shell normalizes the submission
 * contract while leaving runtime/canonical output with the consumer.
 */
export function AIInstructionComposer({
	surface,
	capabilityId,
	value,
	onValueChange,
	onSubmit,
	onStop,
	status = 'idle',
	placeholder,
	context = [],
	contextItems,
	onLoadContextItems,
	onMenuItemSelect,
	compact = false,
	autoFocus = false,
	trailingControls,
}: AIInstructionComposerProps): React.ReactElement {
	const inputRef = React.useRef<PromptInputEditorHandle | null>(null);
	React.useEffect(() => {
		if (!autoFocus) return;
		const frame = requestAnimationFrame(() => inputRef.current?.focus());
		return () => cancelAnimationFrame(frame);
	}, [autoFocus]);
	const running = status === 'submitting' || status === 'streaming';
	return (
		<PromptInput
			className={`pk-ai-instruction${compact ? ' pk-ai-instruction--compact' : ''}`}
			inputFocusRef={inputRef}
			contextItems={contextItems}
			onLoadContextItems={onLoadContextItems}
			onMenuItemSelect={onMenuItemSelect}
			onTextChange={(text) => onValueChange(text)}
			onSubmit={async (message) => {
				const attachments: AIInstructionAttachmentRef[] = message.files.map((file, index) => ({
					id: `${file.name}-${file.size}-${file.lastModified}-${index}`,
					name: file.name,
					mimeType: file.type || 'application/octet-stream',
				}));
				await onSubmit(createAIInstructionSubmission(message.text, context, attachments));
			}}
			data-instruction-surface={surface}
			data-capability-id={capabilityId}
		>
			<AIInstructionDraftSync value={value} />
			{context.length > 0 && (
				<div className="pk-ai-instruction-context" aria-label="AI context">
					{context.map((item) => (
						<span key={item.id} data-source={item.source}>
							{item.label}
						</span>
					))}
				</div>
			)}
			<PromptInputAttachments />
			<div className="pk-ai-instruction-row">
				<AttachmentTrigger />
				<div className="pk-ai-instruction-editor">
					<PromptInputBody
						inputRef={inputRef}
						placeholder={placeholder}
						onTextChange={onValueChange}
					/>
				</div>
				{trailingControls}
				{running ? (
					<Button
						variant="ghost"
						geometry="action-icon"
						type="button"
						className="pk-ai-instruction-submit"
						aria-label="Stop"
						onClick={() => void onStop?.()}
					>
						<Square />
					</Button>
				) : (
					<Button
						variant="ghost"
						geometry="action-icon"
						type="submit"
						className="pk-ai-instruction-submit"
						aria-label="Submit instruction"
						disabled={!value.trim()}
					>
						<ArrowUp />
					</Button>
				)}
			</div>
		</PromptInput>
	);
}

function AIInstructionDraftSync({ value }: { value: string }): null {
	const { textInput } = usePromptInputContext();
	React.useEffect(() => {
		if (textInput.value !== value) textInput.setInput(value);
	}, [textInput, value]);
	return null;
}

function AttachmentTrigger(): React.ReactElement {
	const { attachments } = usePromptInputContext();
	return (
		<Button
			variant="ghost"
			geometry="action-icon"
			type="button"
			className="pk-ai-instruction-attach"
			aria-label="Add attachment"
			title="Add attachment"
			onClick={() => attachments.openFileDialog()}
		>
			<Paperclip />
		</Button>
	);
}
