import React, { useEffect, useMemo, useRef, useState } from 'react';
import { Modal } from '@/ui/components/primitives/Modal';
import { Pill } from '@/ui/components/primitives';
import { MessageSquare, Search } from 'lucide-react';
import type { ChatConversationMeta } from '@/core/types/chat';
import {
	ConversationTypeKind,
	DEFAULT_VIEW_ALL_FILTER,
	ViewAllPickerFilter,
	applyViewAllFilter,
	conversationKind,
} from '@/ui/view/chat-studio-view/chatStudioLeftLogic';
import { useChatStudioLeftStrings } from './chatStudioLeftStringsContext';

interface ViewAllPickerProps {
	open: boolean;
	onOpenChange: (open: boolean) => void;
	metas: ChatConversationMeta[];
	onPick: (id: string) => void;
}

interface FilterableRow {
	id: string;
	title: string;
	conversationType?: ChatConversationMeta['conversationType'];
	updatedAt: number;
}

const KIND_OPTIONS: Array<{ key: ConversationTypeKind | 'all'; labelKey: keyof ReturnType<typeof useChatStudioLeftStrings> }> = [
	{ key: 'all', labelKey: 'typeFilterAll' },
	{ key: 'chat', labelKey: 'typeChat' },
	{ key: 'agent', labelKey: 'typeAgent' },
	{ key: 'plan', labelKey: 'typePlan' },
	{ key: 'canvas', labelKey: 'typeCanvas' },
	{ key: 'template', labelKey: 'typeTemplate' },
	{ key: 'custom', labelKey: 'typeCustom' },
];

/**
 * ViewAllPicker — L-RECENT-02..05.
 *
 * Independent conversation-title picker with (a) case-insensitive title query
 * and (b) canonical ConversationType single-select filter (AND semantics).
 * Filter resets to `all` every time the picker opens so a stale kind doesn't
 * silently hide results.
 */
export const ViewAllPicker: React.FC<ViewAllPickerProps> = ({ open, onOpenChange, metas, onPick }) => {
	const strings = useChatStudioLeftStrings();
	const [filter, setFilter] = useState<ViewAllPickerFilter>(DEFAULT_VIEW_ALL_FILTER);
	const inputRef = useRef<HTMLInputElement | null>(null);

	// LEFT-06: reset filter every open — stale filters must never hide results.
	useEffect(() => {
		if (open) {
			setFilter(DEFAULT_VIEW_ALL_FILTER);
			queueMicrotask(() => inputRef.current?.focus());
		}
	}, [open]);

	const rows: FilterableRow[] = useMemo(
		() => metas
			.filter((m) => !m.archived)
			.map((m) => ({
				id: m.id,
				title: m.title || '',
				conversationType: m.conversationType,
				updatedAt: m.updatedAtTimestamp || m.createdAtTimestamp || 0,
			}))
			.sort((a, b) => b.updatedAt - a.updatedAt),
		[metas]
	);

	const filtered = useMemo(() => applyViewAllFilter(rows, filter), [rows, filter]);

	return (
		<Modal open={open} onOpenChange={onOpenChange}>
			{/* No portalClassName: ReactRenderer now portals into a scoped
			    `.pktw-root .peak-design-root` host, so the tokens already resolve. */}
			<Modal.Content width="default">
				<Modal.Header>
					<Modal.Title>{strings.viewAllLabel}</Modal.Title>
					<Modal.Close />
				</Modal.Header>
				<div className="pktw-flex pktw-flex-col pktw-gap-3 pktw-p-4">
					<PickerSearchBar
						inputRef={inputRef}
						value={filter.query}
						placeholder={strings.pickerPlaceholder}
						onChange={(query) => setFilter((f) => ({ ...f, query }))}
					/>
					<PickerTypeFilters
						strings={strings}
						value={filter.typeKind}
						onChange={(typeKind) => setFilter((f) => ({ ...f, typeKind }))}
					/>
					<PickerResults
						rows={filtered}
						strings={strings}
						onPick={(id) => {
							onOpenChange(false);
							onPick(id);
						}}
					/>
				</div>
			</Modal.Content>
		</Modal>
	);
};

interface PickerSearchBarProps {
	inputRef: React.MutableRefObject<HTMLInputElement | null>;
	value: string;
	placeholder: string;
	onChange: (v: string) => void;
}

const PickerSearchBar: React.FC<PickerSearchBarProps> = ({ inputRef, value, placeholder, onChange }) => (
	<div className="pkstudio-picker-search">
		<Search aria-hidden />
		<input
			ref={inputRef}
			type="text"
			value={value}
			placeholder={placeholder}
			onChange={(e) => onChange(e.target.value)}
		/>
	</div>
);

interface PickerTypeFiltersProps {
	strings: ReturnType<typeof useChatStudioLeftStrings>;
	value: ConversationTypeKind | 'all';
	onChange: (kind: ConversationTypeKind | 'all') => void;
}

const PickerTypeFilters: React.FC<PickerTypeFiltersProps> = ({ strings, value, onChange }) => (
	<div className="pktw-flex pktw-flex-wrap pktw-gap-1.5" role="radiogroup" aria-label={strings.typeFilterAll}>
		{KIND_OPTIONS.map((opt) => (
			<Pill
				key={opt.key}
				selected={value === opt.key}
				onClick={() => onChange(opt.key)}
				role="radio"
				aria-checked={value === opt.key}
			>
				{strings[opt.labelKey] as string}
			</Pill>
		))}
	</div>
);

interface PickerResultsProps {
	rows: FilterableRow[];
	strings: ReturnType<typeof useChatStudioLeftStrings>;
	onPick: (id: string) => void;
}

const PickerResults: React.FC<PickerResultsProps> = ({ rows, strings, onPick }) => {
	if (rows.length === 0) {
		return <div className="pkstudio-picker-empty">{strings.pickerEmpty}</div>;
	}
	return (
		<div className="pktw-flex pktw-flex-col pktw-max-h-[420px] pktw-overflow-auto">
			{rows.map((row) => (
				<button
					key={row.id}
					type="button"
					onClick={() => onPick(row.id)}
					className="pkstudio-picker-row"
				>
					<MessageSquare aria-hidden />
					<span className="pkstudio-picker-row__label">{row.title || strings.untitledLabel}</span>
					<span className="pkstudio-picker-row__tag">
						{strings[typeLabelKey(conversationKind(row))] as string}
					</span>
				</button>
			))}
		</div>
	);
};

function typeLabelKey(kind: ConversationTypeKind): keyof ReturnType<typeof useChatStudioLeftStrings> {
	if (kind === 'agent') return 'typeAgent';
	if (kind === 'plan') return 'typePlan';
	if (kind === 'canvas') return 'typeCanvas';
	if (kind === 'template') return 'typeTemplate';
	if (kind === 'custom') return 'typeCustom';
	return 'typeChat';
}
