import React, { useEffect, useState } from 'react';
import { Archive, ArchiveRestore, Bot, Check, ChevronDown, Copy, Eye, EyeOff, MessageSquare, Pencil, Search, Sparkles, Trash2 } from 'lucide-react';
import { Popover, PopoverContent, PopoverTrigger, IconButton } from '@/ui/components/primitives';
import { useServiceContext } from '@/ui/context/ServiceContext';
import { useChatStudioStrings } from '../../chatStudioStringsContext';
import { AssistantBuilderModal } from './AssistantBuilderModal';
import { DEFAULT_ASSISTANT_ID, type ChatAssistantDefinition } from '@/core/types/chat-studio';
import { useChatDataStore } from '@/ui/store/chatDataStore';
import { useEphemeralAssistantStore } from '../../store/ephemeralAssistantStore';
import { PEAK_CONTROL_KEY_TIP_KEYS } from '@/ui/keyboard/config/KeyboardNavigationDefaults';

/**
 * Assistant picker (chat-studio §8.6 / COMP-07).
 *
 * The default assistant shows NO chip — the trigger only appears in the
 * footer as a compact affordance; once a non-default Assistant is bound it
 * stays visibly displayed until the user returns to Default. Groups:
 * Built-in / My assistants (mock). Rows carry a monogram icon box, a purpose
 * subtitle, and (for saved assistants) edit / duplicate / delete on hover;
 * deleting a bound Assistant safely falls back to Default at read time. The
 * create entry is an accent-tint CTA card.
 */

export interface ComposerAssistantSelectorProps {
	assistantId: string | undefined;
	onSelect: (assistantId: string | undefined) => void;
	onSurfaceOpenChange?: (open: boolean) => void;
}

export const ComposerAssistantSelector: React.FC<ComposerAssistantSelectorProps> = ({ assistantId, onSelect, onSurfaceOpenChange }) => {
	const strings = useChatStudioStrings();
	const { manager } = useServiceContext();
	const activeConversationId = useChatDataStore((s) => s.activeConversation?.meta.id ?? null);
	const ephemeralDraft = useEphemeralAssistantStore((s) =>
		activeConversationId ? s.previews[activeConversationId] ?? null : null);
	const setPreviewStore = useEphemeralAssistantStore((s) => s.setPreview);
	const [open, setOpen] = useState(false);
	const [query, setQuery] = useState('');
	const [assistants, setAssistants] = useState<ChatAssistantDefinition[]>([]);
	const [builderOpen, setBuilderOpen] = useState(false);
	const [editing, setEditing] = useState<ChatAssistantDefinition | null>(null);
	const [showArchived, setShowArchived] = useState(false);
	const changeOpen = (next: boolean) => {
		setOpen(next);
		onSurfaceOpenChange?.(next);
		if (next) setQuery('');
	};

	const refresh = async () => {
		const list = await manager.assistant.list(showArchived);
		setAssistants(list);
	};

	useEffect(() => {
		if (open) void refresh();
	}, [open, showArchived]);

	const bound = assistantId && assistantId !== DEFAULT_ASSISTANT_ID
		? assistants.find((a) => a.id === assistantId)
		: undefined;
	// Ephemeral preview takes over the chip display but never persists — the
	// underlying assistantId in conversation.meta stays intact so exiting
	// preview instantly reverts to the durable binding.
	const previewing = Boolean(ephemeralDraft);
	const displayName = previewing ? ephemeralDraft?.name : bound?.name;
	const isDefault = !previewing && !bound;

	const exitPreview = () => {
		if (!activeConversationId) return;
		manager.conv.setEphemeralAssistant(activeConversationId, null);
		setPreviewStore(activeConversationId, null);
	};

	const q = query.trim().toLowerCase();
	const filtered = assistants.filter((a) =>
		!q || a.name.toLowerCase().includes(q) || a.summary.toLowerCase().includes(q));

	const rowAction = (label: string, icon: React.ReactNode, onClick: (e: React.MouseEvent) => void) => (
		<IconButton label={label} title={label} onClick={(e) => { e.stopPropagation(); onClick(e); }}>
			{icon}
		</IconButton>
	);

	return (
		<>
			<Popover open={open} onOpenChange={changeOpen}>
				<PopoverTrigger asChild>
					<button
						type="button"
						className="pkchat-run-chip"
						data-state={open ? 'open' : 'closed'}
						data-nondefault={!isDefault ? 'true' : undefined}
						data-preview={previewing ? 'true' : undefined}
						aria-label={strings.composer.assistantDefaultLabel}
						data-peak-keytip-key={PEAK_CONTROL_KEY_TIP_KEYS.chatStudio.composer.assistant}
						data-peak-keytip-label={strings.composer.assistantDefaultLabel}
					>
						<Bot aria-hidden />
						{!isDefault && displayName && (
							<span className="pkchat-run-chip__mid">
								{displayName}
								{previewing && (
									<span className="pktw-ml-1 pktw-text-pk-xs pktw-text-pk-accent-text">
										· {strings.composer.assistantPreviewBadge}
									</span>
								)}
							</span>
						)}
						<ChevronDown />
					</button>
				</PopoverTrigger>
				<PopoverContent align="end" side="top" sideOffset={8} className="pktw-p-0">
					<div className="pktw-w-[300px] pktw-max-h-[380px] pktw-flex pktw-flex-col">
						{/* Header */}
						<div className="pktw-flex pktw-flex-col pktw-gap-0.5 pktw-px-[9px] pktw-py-[7px] pktw-border-b pktw-border-pk-border-soft">
							<span className="pktw-text-xs pktw-font-[650] pktw-text-pk-text-primary">
								{strings.composer.assistantPickerTitle}
							</span>
							<span className="pktw-text-pk-xs pktw-text-pk-text-tertiary pktw-truncate">
								{strings.composer.assistantPickerSubtitle}
							</span>
							{previewing && (
								<button
									type="button"
									className="pktw-inline-flex pktw-items-center pktw-gap-1 pktw-text-pk-xs pktw-text-pk-accent-text pktw-mt-1"
									onClick={() => { exitPreview(); changeOpen(false); }}
								>
									<Eye className="pktw-w-3 pktw-h-3" />
									{strings.composer.assistantPreviewClearLabel}
								</button>
							)}
						</div>

						<div className="pktw-flex-1 pktw-overflow-y-auto pktw-p-[7px]">
							{/* Search */}
							<label className="pktw-flex pktw-items-center pktw-gap-1.5 pktw-h-[34px] pktw-px-[9px] pktw-mb-[7px] pktw-bg-pk-surface-sunken pktw-border pktw-border-pk-border-soft pktw-rounded-[var(--pk-radius-md)]">
								<Search className="pktw-w-[13px] pktw-h-[13px] pktw-text-pk-text-tertiary pktw-shrink-0" />
								<input
									type="text"
									autoFocus
									value={query}
									onChange={(e) => setQuery(e.target.value)}
									placeholder={strings.composer.assistantPickerPlaceholder}
									className="pktw-flex-1 pktw-min-w-0 pktw-bg-transparent pktw-border-0 pktw-outline-none pktw-text-pk-sm pktw-text-pk-text-primary placeholder:pktw-text-pk-text-tertiary"
								/>
								<button
									type="button"
									onClick={() => setShowArchived((v) => !v)}
									aria-pressed={showArchived}
									title={showArchived ? strings.leftColumn.menuArchive : strings.leftColumn.menuRestore}
									aria-label={showArchived ? strings.leftColumn.menuArchive : strings.leftColumn.menuRestore}
									className="pk-icon-btn"
								>
									<EyeOff className="pktw-w-3 pktw-h-3" />
								</button>
							</label>

							{/* Built-in group — Default assistant */}
							<div className="pkchat-assist__group-label">{strings.composer.assistantGroupDefault}</div>
							<button
								type="button"
								className="pkchat-assist__row"
								data-selected={isDefault ? 'true' : undefined}
								onClick={() => { onSelect(undefined); changeOpen(false); }}
							>
								<span className="pkchat-assist__mono"><MessageSquare className="pktw-w-3.5 pktw-h-3.5" /></span>
								<span className="pktw-min-w-0">
									<span className="pktw-block pktw-truncate pktw-text-pk-sm pktw-font-semibold pktw-text-pk-text-primary">{strings.composer.assistantDefaultLabel}</span>
									<span className="pktw-block pktw-truncate pktw-text-pk-xs pktw-text-pk-text-tertiary">{strings.composer.assistantDefaultDescription}</span>
								</span>
								{isDefault && <Check className="pktw-w-3.5 pktw-h-3.5 pktw-shrink-0 pktw-text-pk-accent-text" />}
							</button>

							{/* Saved group — My assistants */}
							{filtered.length > 0 && (
								<div className="pkchat-assist__group-label">{strings.composer.assistantGroupSaved}</div>
							)}
							{filtered.map((assistant) => (
								<div
									key={assistant.id}
									role="button"
									tabIndex={0}
									className="pkchat-assist__row pktw-group"
									data-selected={assistantId === assistant.id ? 'true' : undefined}
									onClick={() => { onSelect(assistant.id); changeOpen(false); }}
									onKeyDown={(e) => { if (e.key === 'Enter') { onSelect(assistant.id); changeOpen(false); } }}
								>
									<span className="pkchat-assist__mono"><Bot className="pktw-w-3.5 pktw-h-3.5" /></span>
									<span className="pktw-min-w-0 pktw-flex-1">
										<span className="pktw-block pktw-truncate pktw-text-pk-sm pktw-font-semibold pktw-text-pk-text-primary">{assistant.name}</span>
										{assistant.summary && (
											<span className="pktw-block pktw-truncate pktw-text-pk-xs pktw-text-pk-text-tertiary">{assistant.summary}</span>
										)}
									</span>
									<span className="pktw-hidden group-hover:pktw-flex pktw-items-center pktw-gap-0.5">
										{rowAction(strings.leftColumn.menuRename, <Pencil />, () => { setEditing(assistant); setBuilderOpen(true); changeOpen(false); })}
										{rowAction(strings.composer.assistantDuplicate, <Copy />, async () => { await manager.assistant.duplicate(assistant.id); void refresh(); })}
										{rowAction(
											assistant.archived ? strings.leftColumn.menuRestore : strings.leftColumn.menuArchive,
											assistant.archived ? <ArchiveRestore /> : <Archive />,
											async () => { await manager.assistant.setArchived(assistant.id, !assistant.archived); void refresh(); },
										)}
										{rowAction(strings.leftColumn.menuDelete, <Trash2 />, async (e) => {
											// Popout-safe confirm: resolve the window from the
											// trigger's ownerDocument, never the global window (FIX 4).
											const win = (e.currentTarget as HTMLElement)?.ownerDocument?.defaultView ?? window;
											if (!win.confirm(strings.composer.assistantDeleteConfirm)) return;
											await manager.assistant.delete(assistant.id);
											if (assistantId === assistant.id) onSelect(undefined);
											void refresh();
										})}
									</span>
									{assistantId === assistant.id && <Check className="pktw-w-3.5 pktw-h-3.5 pktw-shrink-0 pktw-text-pk-accent-text" />}
								</div>
							))}

							{/* Create — accent CTA card */}
							<button
								type="button"
								className="pkchat-assist-create"
								onClick={() => { setEditing(null); setBuilderOpen(true); changeOpen(false); }}
							>
								<Sparkles className="pktw-w-3.5 pktw-h-3.5 pktw-shrink-0" />
								<span className="pktw-min-w-0">
									<span className="pktw-block pktw-truncate pktw-text-pk-sm pktw-font-semibold">{strings.composer.assistantCreateLabel}</span>
									<span className="pktw-block pktw-truncate pktw-text-pk-xs pktw-opacity-80">{strings.composer.assistantCreateDescription}</span>
								</span>
							</button>
						</div>
					</div>
				</PopoverContent>
			</Popover>

			{builderOpen && (
				<AssistantBuilderModal
					open={builderOpen}
					onOpenChange={setBuilderOpen}
					editing={editing}
					onSaved={(saved) => { onSelect(saved.id); void refresh(); }}
				/>
			)}
		</>
	);
};
