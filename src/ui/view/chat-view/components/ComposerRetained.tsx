import React, { useRef, useState } from 'react';
import {
	ChevronDown,
	ChevronRight,
	Send,
	Square,
	Mic,
	Loader2,
	X,
	HelpCircle,
	Microscope,
	Pen,
	CheckSquare,
	Code,
	Sparkles,
	Wrench,
	FileText,
	Database,
	Globe,
	Paperclip,
	Star,
} from 'lucide-react';
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
import { useChatStrings } from '../chatStringsContext';

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
// Mirrors `.run-pop` in chat-retained-mock.html: Mode → Role → Model → Context
// → Tools, with optional dividers between major sections. Sections backed by
// real state are wired (chatMode, enableVaultSearch, enableWebSearch);
// sections without backing yet (Role, Model picker detail, Pinned sources)
// render in a disabled "Coming soon" state — they appear in the UI so users
// see the full surface without false promise.
// ---------------------------------------------------------------------------

type RunRole = 'default' | 'researcher' | 'writer' | 'planner' | 'coder';

const RunChip: React.FC = () => {
	const strings = useChatStrings();
	const [open, setOpen] = useState(false);
	const chatMode = useChatViewStore((s) => s.chatMode);
	const setChatMode = useChatViewStore((s) => s.setChatMode);
	const selectedModel = useChatViewStore((s) => s.selectedModel);
	const enableVaultSearch = useChatViewStore((s) => s.enableVaultSearch);
	const setEnableVaultSearch = useChatViewStore((s) => s.setEnableVaultSearch);
	const enableWebSearch = useChatViewStore((s) => s.enableWebSearch);
	const setEnableWebSearch = useChatViewStore((s) => s.setEnableWebSearch);
	const currentTags = useChatViewStore((s) => s.currentInputTags);
	const ctxCount = currentTags.filter((t) => t.type === 'context').length;

	// Role is not yet wired through to message dispatch (no role field on
	// outgoing messages). We keep selection local so users get visual
	// feedback; PR-Chat-5+ will route this into the system prompt.
	const [role, setRole] = useState<RunRole>('default');

	const RUN_MODE_OPTIONS = [
		{ value: 'chat' as const, label: strings.composer.runChipModeChat },
		{ value: 'agent' as const, label: strings.composer.runChipModeAgent },
		{ value: 'plan' as const, label: strings.composer.runChipModePlan },
	];

	const ROLE_OPTIONS: Array<{ id: RunRole; label: string; icon: React.ReactNode }> = [
		{ id: 'default', label: strings.runSettings.roleDefault, icon: <HelpCircle /> },
		{ id: 'researcher', label: strings.runSettings.roleResearcher, icon: <Microscope /> },
		{ id: 'writer', label: strings.runSettings.roleWriter, icon: <Pen /> },
		{ id: 'planner', label: strings.runSettings.rolePlanner, icon: <CheckSquare /> },
		{ id: 'coder', label: strings.runSettings.roleCoder, icon: <Code /> },
	];

	const modeLabel =
		RUN_MODE_OPTIONS.find((opt) => opt.value === chatMode)?.label ??
		strings.composer.runChipModeChat;

	const roleLabel =
		ROLE_OPTIONS.find((opt) => opt.id === role)?.label ?? strings.runSettings.roleDefault;

	const modelSummary = selectedModel
		? `${selectedModel.provider}/${selectedModel.modelId}`
		: strings.composer.runChipModelAuto;

	return (
		<Popover open={open} onOpenChange={setOpen}>
			<PopoverTrigger asChild>
				<button
					type="button"
					className="pkchat-run-chip"
					data-state={open ? 'open' : 'closed'}
					aria-label={strings.composer.runChipLabel}
				>
					<span className="pkchat-run-chip__label">{modeLabel}</span>
					<span className="pkchat-run-chip__sep">·</span>
					<span className="pkchat-run-chip__mid">
						{selectedModel ? selectedModel.modelId : strings.composer.runChipModelAuto}
					</span>
					<span className="pkchat-run-chip__sep">·</span>
					<span className="pkchat-run-chip__ctx">
						{ctxCount} {strings.composer.runChipCtxSuffix}
					</span>
					<span className="pkchat-run-chip__sep">·</span>
					<span className="pkchat-run-chip__mid">{roleLabel}</span>
					<ChevronDown />
				</button>
			</PopoverTrigger>
			<PopoverContent align="end" side="top" sideOffset={8}>
				<div className="pkchat-runpop">
					<div className="pkchat-runpop__head">
						<span className="pkchat-runpop__title">
							{strings.runSettings.title}
						</span>
						<span className="pkchat-runpop__sub">
							{strings.runSettings.subtitle}
						</span>
					</div>

					{/* Mode ─────────────────────────────────────── */}
					<div>
						<span className="pkchat-runpop__label">
							{strings.runSettings.fieldMode}
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

					{/* Role ─────────────────────────────────────── */}
					<div>
						<span className="pkchat-runpop__label">
							{strings.runSettings.fieldRole}
						</span>
						<div className="pkchat-runpop__role-grid">
							{ROLE_OPTIONS.map((opt) => {
								const isActive = opt.id === role;
								return (
									<button
										key={opt.id}
										type="button"
										className="pkchat-runpop__role-pill"
										data-selected={isActive ? 'true' : undefined}
										onClick={() => setRole(opt.id)}
									>
										<span className="pkchat-runpop__role-ico">{opt.icon}</span>
										<span>{opt.label}</span>
									</button>
								);
							})}
						</div>
						<div className="pkchat-runpop__hint">
							{strings.runSettings.roleHint}
						</div>
					</div>

					{/* Model routing ────────────────────────────── */}
					<div>
						<span className="pkchat-runpop__label">
							{strings.runSettings.fieldModel}
						</span>
						<div
							className="pkchat-runpop__row"
							data-selected={!selectedModel ? 'true' : undefined}
						>
							<span className="pkchat-runpop__row-ico"><Sparkles /></span>
							<span className="pkchat-runpop__row-body">
								<span className="pkchat-runpop__row-name">
									{strings.runSettings.modelAutoTitle}
								</span>
								<span className="pkchat-runpop__row-sub">
									{selectedModel ? modelSummary : strings.composer.runChipModelAuto}
								</span>
							</span>
							{!selectedModel && (
								<span className="pkchat-runpop__row-dot" aria-hidden />
							)}
						</div>
						<div
							className="pkchat-runpop__row"
							data-disabled="true"
							title={strings.runSettings.comingSoonHint}
						>
							<span className="pkchat-runpop__row-ico"><Wrench /></span>
							<span className="pkchat-runpop__row-body">
								<span className="pkchat-runpop__row-name">
									{strings.runSettings.modelManualTitle}
								</span>
								<span className="pkchat-runpop__row-sub">
									{strings.runSettings.modelManualSub}
								</span>
							</span>
							<ChevronRight className="pkchat-runpop__row-chev" />
						</div>
					</div>

					{/* Context ──────────────────────────────────── */}
					<div>
						<span className="pkchat-runpop__label">
							{strings.runSettings.fieldContext}
						</span>
						<button
							type="button"
							className="pkchat-runpop__row pkchat-runpop__row--toggle"
							data-on={enableVaultSearch ? 'true' : undefined}
							data-disabled="true"
							title={strings.runSettings.comingSoonHint}
						>
							<span className="pkchat-runpop__row-ico"><FileText /></span>
							<span className="pkchat-runpop__row-body">
								<span className="pkchat-runpop__row-name">
									{strings.runSettings.contextCurrentNote}
								</span>
							</span>
							<span className="pkchat-runpop__switch" aria-hidden />
						</button>
						<button
							type="button"
							className="pkchat-runpop__row pkchat-runpop__row--toggle"
							data-on={enableVaultSearch ? 'true' : undefined}
							onClick={() => setEnableVaultSearch(!enableVaultSearch)}
						>
							<span className="pkchat-runpop__row-ico"><Database /></span>
							<span className="pkchat-runpop__row-body">
								<span className="pkchat-runpop__row-name">
									{strings.runSettings.contextVaultSearch}
								</span>
							</span>
							<span className="pkchat-runpop__switch" aria-hidden />
						</button>
						<button
							type="button"
							className="pkchat-runpop__row pkchat-runpop__row--toggle"
							data-on={enableWebSearch ? 'true' : undefined}
							onClick={() => setEnableWebSearch(!enableWebSearch)}
						>
							<span className="pkchat-runpop__row-ico"><Globe /></span>
							<span className="pkchat-runpop__row-body">
								<span className="pkchat-runpop__row-name">
									{strings.runSettings.contextWebSearch}
								</span>
							</span>
							<span className="pkchat-runpop__switch" aria-hidden />
						</button>
					</div>

					{/* Tools ────────────────────────────────────── */}
					<div>
						<span className="pkchat-runpop__label">
							{strings.runSettings.fieldTools}
						</span>
						<div
							className="pkchat-runpop__row"
							data-disabled="true"
							title={strings.runSettings.comingSoonHint}
						>
							<span className="pkchat-runpop__row-ico"><Paperclip /></span>
							<span className="pkchat-runpop__row-body">
								<span className="pkchat-runpop__row-name">
									{ctxCount} {strings.composer.runChipCtxSuffix}
								</span>
							</span>
							<span className="pkchat-runpop__ctx-chip">
								{ctxCount} {strings.composer.runChipCtxSuffix}
							</span>
						</div>
						<div
							className="pkchat-runpop__row"
							data-disabled="true"
							title={strings.runSettings.comingSoonHint}
						>
							<span className="pkchat-runpop__row-ico"><Star /></span>
							<span className="pkchat-runpop__row-body">
								<span className="pkchat-runpop__row-name">
									{strings.runSettings.toolsPinnedSources}
								</span>
							</span>
							<ChevronDown className="pkchat-runpop__row-chev" />
						</div>
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
	const strings = useChatStrings();
	const { textInput } = usePromptInputContext();
	const hasInput = textInput.value.trim().length > 0;
	const isStreaming = status === 'streaming';
	const isSubmitting = status === 'submitted';

	if (isStreaming) {
		return (
			<button
				type="button"
				className="pkchat-send"
				aria-label={strings.composer.cancelLabel}
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
				aria-label={strings.composer.sendLabel}
				disabled
			>
				<Loader2 className="pktw-animate-spin" />
			</button>
		);
	}

	if (!hasInput) {
		return (
			<IconButton
				label={strings.composer.voiceLabel}
				title={strings.composer.voiceLabel}
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
			aria-label={strings.composer.sendLabel}
		>
			<Send />
		</button>
	);
};

// ---------------------------------------------------------------------------
// ComposerRetained — root composer for the retained chat surface.
// ---------------------------------------------------------------------------

export const ComposerRetained: React.FC = () => {
	const strings = useChatStrings();
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
						placeholder={placeholder ?? strings.composer.placeholder}
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
