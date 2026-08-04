import * as React from 'react';
import { ArrowUp, Paperclip, Square } from 'lucide-react';
import {
	SharedAIInstructionController,
	normalizeAIInstructionAttachments,
	resolveAIInstructionKeyAction,
	type AIInstructionAttachmentRef,
	type AIInstructionContextRef,
	type AIInstructionControllerSnapshot,
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
import { BrowserAIInstructionDraftStore } from './BrowserAIInstructionDraftStore';

export interface AIInstructionComposerProps {
	surface: AIInstructionSurface;
	capabilityId: string;
	value: string;
	onValueChange(value: string): void;
	onSubmit(submission: AIInstructionSubmission): void | Promise<void>;
	onStop?(): void | Promise<void>;
	onDismiss?(): void;
	status?: AIInstructionRunStatus;
	error?: string | null;
	placeholder: string;
	context?: readonly AIInstructionContextRef[];
	contextItems?: NavigableMenuItem[];
	slashItems?: NavigableMenuItem[];
	onLoadContextItems?: (query: string, currentFolder?: string) => Promise<NavigableMenuItem[]>;
	onMenuItemSelect?: (triggerChar: string, selectedItem: NavigableMenuItem, resolvedText?: string) => void;
	compact?: boolean;
	singleLine?: boolean;
	autoFocus?: boolean;
	draftKey?: string;
	submitDisabled?: boolean;
	trailingControls?: React.ReactNode;
	attachmentIcon?: React.ReactNode;
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
	onDismiss,
	status = 'idle',
	error = null,
	placeholder,
	context = [],
	contextItems,
	slashItems,
	onLoadContextItems,
	onMenuItemSelect,
	compact = false,
	singleLine = false,
	autoFocus = false,
	draftKey,
	submitDisabled = false,
	trailingControls,
	attachmentIcon,
}: AIInstructionComposerProps): React.ReactElement {
	const inputRef = React.useRef<PromptInputEditorHandle | null>(null);
	const submitRef = React.useRef(onSubmit);
	const stopRef = React.useRef(onStop);
	const valueChangeRef = React.useRef(onValueChange);
	submitRef.current = onSubmit;
	stopRef.current = onStop;
	valueChangeRef.current = onValueChange;
	const contextRef = React.useRef(context);
	contextRef.current = context;
	const resolvedDraftKey = draftKey ?? `${surface}:${capabilityId}`;
	const draftStore = React.useMemo(() => new BrowserAIInstructionDraftStore(), []);
	const controller = React.useMemo(
		() => new SharedAIInstructionController(
			{
				surface,
				capabilityId,
				placeholder,
				context: () => undefined,
				submit: async (envelope) => {
					await submitRef.current(envelope.submission);
				},
				stop: async () => {
					await stopRef.current?.();
				},
			},
			draftStore,
			resolvedDraftKey,
		),
		[capabilityId, draftStore, placeholder, resolvedDraftKey, surface],
	);
	const [snapshot, setSnapshot] = React.useState<AIInstructionControllerSnapshot>(
		() => controller.snapshot(),
	);
	const historyIndexRef = React.useRef(-1);
	const externalDraftInitializedRef = React.useRef(false);
	const externalDraftControllerRef = React.useRef(controller);
	React.useEffect(() => {
		let initialSnapshot = true;
		return controller.subscribe((next) => {
			setSnapshot(next);
			if (initialSnapshot) {
				initialSnapshot = false;
				return;
			}
			valueChangeRef.current(next.draft);
		});
	}, [controller]);
	React.useEffect(() => {
		controller.syncStatus(status, error);
	}, [controller, error, status]);
	React.useEffect(() => {
		if (externalDraftControllerRef.current !== controller) {
			externalDraftControllerRef.current = controller;
			externalDraftInitializedRef.current = false;
		}
		if (!externalDraftInitializedRef.current) {
			externalDraftInitializedRef.current = true;
			const restoredDraft = controller.snapshot().draft;
			if (restoredDraft && !value) {
				valueChangeRef.current(restoredDraft);
				return;
			}
		}
		controller.setDraft(value);
	}, [controller, value]);
	React.useEffect(() => {
		if (!autoFocus) return;
		const frame = requestAnimationFrame(() => inputRef.current?.focus());
		return () => cancelAnimationFrame(frame);
	}, [autoFocus]);
	const running = snapshot.status === 'submitting' || snapshot.status === 'streaming';
	return (
		<PromptInput
			className={`pk-ai-instruction${compact ? ' pk-ai-instruction--compact' : ''}`}
			inputFocusRef={inputRef}
			contextItems={contextItems}
			onLoadContextItems={onLoadContextItems}
			onMenuItemSelect={onMenuItemSelect}
			onTextChange={(text) => controller.setDraft(text)}
			onSubmit={async (message) => {
				const attachments: AIInstructionAttachmentRef[] =
					await normalizeAIInstructionAttachments(message.files);
				controller.setDraft(message.text);
				await controller.submit(contextRef.current, attachments);
			}}
			onCompositionStart={() => controller.setComposing(true)}
			onCompositionEnd={() => controller.setComposing(false)}
			onKeyDownCapture={(event) => {
				if (event.altKey && event.key === 'ArrowUp') {
					const nextIndex = Math.min(
						historyIndexRef.current + 1,
						controller.recent().length - 1,
					);
					if (nextIndex >= 0 && controller.restoreRecent(nextIndex)) {
						historyIndexRef.current = nextIndex;
						event.preventDefault();
					}
					return;
				}
				if (event.altKey && event.key === 'ArrowDown') {
					const nextIndex = historyIndexRef.current - 1;
					if (nextIndex >= 0 && controller.restoreRecent(nextIndex)) {
						historyIndexRef.current = nextIndex;
						event.preventDefault();
						return;
					}
					historyIndexRef.current = -1;
					controller.setDraft('');
					event.preventDefault();
					return;
				}
				const action = resolveAIInstructionKeyAction({
					key: event.key,
					shiftKey: event.shiftKey,
					composing: snapshot.composing,
					status: snapshot.status,
				});
				if (action === 'stop') {
					event.preventDefault();
					event.stopPropagation();
					void controller.stop();
					return;
				}
				if (action === 'dismiss' && onDismiss) {
					event.preventDefault();
					event.stopPropagation();
					onDismiss();
				}
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
				<AttachmentTrigger icon={attachmentIcon} />
				<div className="pk-ai-instruction-editor">
					<PromptInputBody
						inputRef={inputRef}
						placeholder={placeholder}
						singleLine={singleLine}
						slashItems={slashItems}
						onTextChange={(text) => controller.setDraft(text)}
					/>
				</div>
				{trailingControls}
				<AIInstructionSubmitControl
					running={running}
					controller={controller}
					submitDisabled={submitDisabled}
					hasText={Boolean(snapshot.draft.trim())}
				/>
			</div>
			{snapshot.error && (
				<div className="pk-ai-instruction-error" role="alert">
					<span>{snapshot.error}</span>
					<Button
						variant="ghost"
						type="button"
						onClick={() => controller.retry()}
					>
						Retry
					</Button>
				</div>
			)}
		</PromptInput>
	);
}

function AIInstructionSubmitControl({
	running,
	controller,
	submitDisabled,
	hasText,
}: {
	running: boolean;
	controller: SharedAIInstructionController<undefined, void>;
	submitDisabled: boolean;
	hasText: boolean;
}): React.ReactElement {
	const { attachments } = usePromptInputContext();
	if (running) {
		return (
			<Button
				variant="ghost"
				geometry="action-icon"
				type="button"
				className="pk-ai-instruction-submit"
				aria-label="Stop"
				onClick={() => void controller.stop()}
			>
				<Square />
			</Button>
		);
	}
	return (
		<Button
			variant="ghost"
			geometry="action-icon"
			type="submit"
			className="pk-ai-instruction-submit"
			aria-label="Submit instruction"
			disabled={submitDisabled || (!hasText && attachments.files.length === 0)}
		>
			<ArrowUp />
		</Button>
	);
}

function AIInstructionDraftSync({ value }: { value: string }): null {
	const { textInput } = usePromptInputContext();
	React.useEffect(() => {
		if (textInput.value !== value) textInput.setInput(value);
	}, [textInput, value]);
	return null;
}

function AttachmentTrigger({ icon }: { icon?: React.ReactNode }): React.ReactElement {
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
			{icon ?? <Paperclip />}
		</Button>
	);
}
