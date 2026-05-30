import React, { useRef, useState } from 'react';
import { ChevronDown, Send, Square, Mic, Loader2, X } from 'lucide-react';
import {
	PromptInput,
	PromptInputBody,
	PromptInputAttachments,
	usePromptInputContext,
	type PromptInputEditorHandle,
} from '@/ui/component/prompt-input';
import { cn } from '@/ui/react/lib/utils';
import {
	Popover,
	PopoverContent,
	PopoverTrigger,
	Segmented,
	IconButton,
} from '@/ui/components/primitives';
import { useChatDataStore } from '@/ui/store/chatDataStore';
import { useChatViewStore } from '../store/chatViewStore';
import { useContextSearch } from '../hooks/useContextSearch';
import { useInputKeyboard } from '../hooks/useInputKeyboard';
import { useInputSubmit } from '../hooks/useInputSubmit';
import { PromptEnhanceSuggestion } from './PromptEnhanceSuggestion';
import { CHAT_STRINGS } from '../chatStrings';

// ---------------------------------------------------------------------------
// Helpers wired into PromptInput context
// ---------------------------------------------------------------------------

const InputClearHandler: React.FC<{ isSending: boolean }> = ({ isSending }) => {
	const inputContext = usePromptInputContext();
	const prevRef = useRef(isSending);
	React.useEffect(() => {
		if (!prevRef.current && isSending) {
			inputContext.textInput.clear();
			inputContext.attachments.clear();
		}
		prevRef.current = isSending;
	}, [isSending, inputContext]);
	return null;
};

const InsertToInputHandler: React.FC = () => {
	const { textInput, focusInput } = usePromptInputContext();
	React.useEffect(() => {
		const fn = (text: string) => {
			const current = textInput.value;
			const prefix = current && !current.endsWith('\n') ? '\n' : '';
			textInput.setInput(current + prefix + text);
			focusInput();
		};
		useChatViewStore.getState().setInsertToInput(fn);
		return () => useChatViewStore.getState().setInsertToInput(null);
	}, [textInput, focusInput]);
	return null;
};

// ---------------------------------------------------------------------------
// Run-chip popover — single affordance for mode/model/role/context.
// PR-Chat-1 ships with mode (wired to existing chatViewStore.chatMode) plus
// placeholders for model and role. PR-Chat-2+ may extend.
// ---------------------------------------------------------------------------

const RUN_MODE_OPTIONS = [
	{ value: 'chat' as const, label: CHAT_STRINGS.composer.runChipModeChat },
	{ value: 'agent' as const, label: CHAT_STRINGS.composer.runChipModeAgent },
	{ value: 'plan' as const, label: CHAT_STRINGS.composer.runChipModePlan },
];

const RunChip: React.FC = () => {
	const [open, setOpen] = useState(false);
	const chatMode = useChatViewStore((s) => s.chatMode);
	const setChatMode = useChatViewStore((s) => s.setChatMode);
	const currentTags = useChatViewStore((s) => s.currentInputTags);
	const ctxCount = currentTags.filter((t) => t.type === 'context').length;

	const modeLabel =
		RUN_MODE_OPTIONS.find((opt) => opt.value === chatMode)?.label ??
		CHAT_STRINGS.composer.runChipModeChat;

	return (
		<Popover open={open} onOpenChange={setOpen}>
			<PopoverTrigger asChild>
				<button
					type="button"
					className="pkchat-run-chip"
					data-state={open ? 'open' : 'closed'}
					aria-label={CHAT_STRINGS.composer.runChipLabel}
				>
					<span className="pkchat-run-chip__label">{modeLabel}</span>
					<span className="pkchat-run-chip__sep">·</span>
					<span className="pkchat-run-chip__mid">
						{CHAT_STRINGS.composer.runChipModelAuto}
					</span>
					<span className="pkchat-run-chip__sep">·</span>
					<span className="pkchat-run-chip__ctx">
						{ctxCount} {CHAT_STRINGS.composer.runChipCtxSuffix}
					</span>
					<ChevronDown />
				</button>
			</PopoverTrigger>
			<PopoverContent align="end" side="top" sideOffset={8}>
				<div className="pkchat-runpop">
					<div className="pkchat-runpop__head">
						<span className="pkchat-runpop__title">
							{CHAT_STRINGS.runSettings.title}
						</span>
						<span className="pkchat-runpop__sub">
							{CHAT_STRINGS.runSettings.subtitle}
						</span>
					</div>

					<div>
						<span className="pkchat-runpop__label">
							{CHAT_STRINGS.runSettings.fieldMode}
						</span>
						<div style={{ marginTop: 6 }}>
							<Segmented
								value={chatMode}
								onValueChange={(v) =>
									setChatMode(v as 'chat' | 'agent' | 'plan')
								}
								options={RUN_MODE_OPTIONS}
							/>
						</div>
					</div>

					<div className="pkchat-runpop__hint">
						{CHAT_STRINGS.runSettings.roleHint}
					</div>
				</div>
			</PopoverContent>
		</Popover>
	);
};

// ---------------------------------------------------------------------------
// SendButton — primary submit / streaming-cancel control. Falls back to mic
// when there's nothing typed (matches retained mock).
// ---------------------------------------------------------------------------

interface SendButtonProps {
	status: 'ready' | 'submitted' | 'streaming';
	onCancel?: () => void | Promise<void>;
}

const SendButton: React.FC<SendButtonProps> = ({ status, onCancel }) => {
	const { textInput } = usePromptInputContext();
	const hasInput = textInput.value.trim().length > 0;
	const isStreaming = status === 'streaming';
	const isSubmitting = status === 'submitted';

	if (isStreaming) {
		return (
			<button
				type="button"
				className="pkchat-send"
				aria-label={CHAT_STRINGS.composer.cancelLabel}
				onClick={async (e) => {
					e.preventDefault();
					e.stopPropagation();
					if (onCancel) await onCancel();
				}}
			>
				<Square />
			</button>
		);
	}

	if (isSubmitting) {
		return (
			<button
				type="button"
				className="pkchat-send"
				aria-label={CHAT_STRINGS.composer.sendLabel}
				disabled
			>
				<Loader2 className="pktw-animate-spin" />
			</button>
		);
	}

	if (!hasInput) {
		return (
			<IconButton
				label={CHAT_STRINGS.composer.voiceLabel}
				title={CHAT_STRINGS.composer.voiceLabel}
				disabled
			>
				<Mic />
			</IconButton>
		);
	}

	return (
		<button
			type="submit"
			className="pkchat-send"
			aria-label={CHAT_STRINGS.composer.sendLabel}
		>
			<Send />
		</button>
	);
};

// ---------------------------------------------------------------------------
// ComposerRetained — root composer for the retained chat surface.
// ---------------------------------------------------------------------------

export const ComposerRetained: React.FC = () => {
	const activeConversation = useChatDataStore((s) => s.activeConversation);

	const textareaRef = useRef<PromptInputEditorHandle>(null);
	const inputFocusRef = useRef<{ focus: () => void } | null>(null);

	const {
		isSending,
		status,
		placeholder,
		handleSubmit,
		handleCancelStream,
		handleTextChange,
	} = useInputSubmit();

	const {
		menuContextItems,
		folderStack,
		handleSearchContext,
		handleMenuSelect,
		handleFolderUp,
	} = useContextSearch();
	useInputKeyboard(textareaRef, activeConversation?.meta?.id ?? null);

	return (
		<div className="pkchat-composer-wrap">
			<PromptInput
				className={cn('pkchat-composer')}
				globalDrop
				multiple
				inputFocusRef={inputFocusRef}
				onSubmit={handleSubmit}
				contextItems={menuContextItems}
				onLoadContextItems={handleSearchContext}
				onMenuItemSelect={handleMenuSelect}
				folderStack={folderStack}
				onFolderUp={handleFolderUp}
				onTextChange={handleTextChange}
			>
				<InputClearHandler isSending={isSending} />
				<InsertToInputHandler />
				<PromptInputAttachments />
				<div className="pkchat-composer__editor">
					<PromptInputBody
						ref={textareaRef}
						inputRef={inputFocusRef}
						placeholder={placeholder ?? CHAT_STRINGS.composer.placeholder}
					/>
				</div>
				<PromptEnhanceSuggestion />

				<div className="pkchat-composer__foot">
					{/*
					  Tools cluster (attach / context / vault search / etc.) is intentionally
					  omitted in PR-Chat-1 — the retained mock collapses these into the
					  run-chip popover, which PR-Chat-2+ will flesh out.
					*/}
					<div className="pkchat-composer__foot-right">
						<RunChip />
						<SendButton status={status} onCancel={handleCancelStream} />
					</div>
				</div>
			</PromptInput>
		</div>
	);
};
