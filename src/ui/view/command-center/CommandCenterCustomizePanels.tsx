import React, { useEffect, useMemo, useState } from 'react';
import { motion, useReducedMotion } from 'framer-motion';
import { ArrowDown, ArrowUp, GripVertical } from 'lucide-react';
import type {
	CommandCenterActionItem,
	CommandCenterBoardConfig,
	CommandCenterDisplayMode,
	CommandCenterGroup,
	CommandCenterItemIcon,
} from '@/core/command-center';
import { Button, IconButton, Segmented, Toggle } from '@/ui/components/primitives';
import { CommandCenterIcon } from './CommandCenterIcon';
import { IconBrowser } from './IconBrowser';

const DISPLAY_OPTIONS: ReadonlyArray<{ value: CommandCenterDisplayMode; label: string }> = [
	{ value: 'auto', label: 'Auto' },
	{ value: 'icon', label: 'Icon' },
	{ value: 'compact', label: '3' },
	{ value: 'wide', label: '2' },
	{ value: 'full', label: '1' },
];

const DISPLAY_LABELS: Record<CommandCenterDisplayMode, string> = {
	auto: 'Auto width',
	icon: 'Icon tile',
	compact: '3 per row',
	wide: '2 per row',
	full: 'Full width',
};

function commitTextDraft(
	draft: string,
	fallback: string,
	onCommit: (value: string) => void,
	onReset: (value: string) => void,
): void {
	const value = draft.trim();
	if (!value) {
		onReset(fallback);
		return;
	}
	onReset(value);
	if (value !== fallback) onCommit(value);
}

export function CommandCenterItemEditor({
	item,
	onUpdate,
	onPin,
}: {
	item: CommandCenterActionItem;
	onUpdate: (mutate: (target: CommandCenterActionItem) => void) => void;
	onPin: (checked: boolean) => void;
}): React.ReactElement {
	const editorRef = React.useRef<HTMLDivElement>(null);
	const reducedMotion = useReducedMotion();
	const [nameDraft, setNameDraft] = useState(item.shortLabel);
	const [aliasesDraft, setAliasesDraft] = useState(item.aliases.join(', '));
	const [iconOpen, setIconOpen] = useState(false);
	useEffect(() => {
		setNameDraft(item.shortLabel);
		setAliasesDraft(item.aliases.join(', '));
		setIconOpen(false);
	}, [item.id]);
	useEffect(() => {
		if (!iconOpen) return;
		const ownerWindow = editorRef.current?.ownerDocument.defaultView;
		ownerWindow?.requestAnimationFrame(() => editorRef.current?.querySelector('.pk-cc-icon-browser')?.scrollIntoView({
			block: 'nearest',
			behavior: reducedMotion ? 'auto' : 'smooth',
		}));
	}, [iconOpen, reducedMotion]);

	const commitName = (): void => {
		commitTextDraft(nameDraft, item.shortLabel, (value) => onUpdate((target) => { target.shortLabel = value; }), setNameDraft);
	};
	const commitAliases = (): void => {
		const aliases = aliasesDraft.split(',').map((alias) => alias.trim()).filter(Boolean).slice(0, 12);
		setAliasesDraft(aliases.join(', '));
		onUpdate((target) => { target.aliases = aliases; });
	};
	const onDraftKeyDown = (event: React.KeyboardEvent<HTMLInputElement>, reset: () => void): void => {
		if (event.key === 'Enter') {
			event.currentTarget.blur();
			return;
		}
		if (event.key !== 'Escape') return;
		event.preventDefault();
		reset();
	};
	const displayOptions = DISPLAY_OPTIONS.filter((option) => option.value !== 'icon' || Boolean(item.icon));

	return (
		<div ref={editorRef} className="pk-cc-item-editor">
			<div className="pk-cc-item-editor__head">
				<span>Customize action</span>
				<span>{DISPLAY_LABELS[item.display]}</span>
			</div>
			<div className="pk-cc-item-editor__fields">
				<label>
					<span>Name</span>
					<input value={nameDraft} onChange={(event) => setNameDraft(event.target.value)} onBlur={commitName} onKeyDown={(event) => onDraftKeyDown(event, () => setNameDraft(item.shortLabel))} />
				</label>
				<label>
					<span>Search aliases</span>
					<input value={aliasesDraft} placeholder="Separate with commas" onChange={(event) => setAliasesDraft(event.target.value)} onBlur={commitAliases} onKeyDown={(event) => onDraftKeyDown(event, () => setAliasesDraft(item.aliases.join(', ')))} />
				</label>
			</div>
			<div className="pk-cc-item-editor__row">
				<span>Display</span>
				<span className="pk-cc-item-editor__control"><Segmented value={item.display} onValueChange={(mode) => onUpdate((target) => { target.display = mode; })} options={displayOptions} variant="animated-pill" size="sm" aria-label="Display mode" /><span>Auto measures the rendered name and selects 3, 2, or 1 column without rewriting it.</span></span>
			</div>
			<div className="pk-cc-item-editor__row">
				<span>Icon</span>
				<Button variant="secondary" size="sm" className="pk-cc-icon-picker-trigger" onClick={() => setIconOpen((open) => !open)}>
					<CommandCenterIcon icon={item.icon} size={15} />
					<span>{item.icon?.kind === 'lucide' ? item.icon.name : item.icon?.value ?? 'Choose icon'}</span>
				</Button>
			</div>
			<div className="pk-cc-item-editor__row pk-cc-item-editor__home-row">
				<span>Show on Home</span>
				<span className="pk-cc-item-editor__control"><Toggle checked={item.pinnedToHome} label={`Show ${item.shortLabel} on Command Center Home`} onCheckedChange={onPin} /><span>Also place this action in the full Command Center Home workspace.</span></span>
			</div>
			{iconOpen ? (
				<IconBrowser
					value={item.icon}
					onChange={(icon: CommandCenterItemIcon | undefined) => onUpdate((target) => {
						target.icon = icon;
						if (!icon && target.display === 'icon') target.display = 'auto';
					})}
					onClose={() => setIconOpen(false)}
				/>
			) : null}
		</div>
	);
}

function MoveButtons({ index, count, onMove }: { index: number; count: number; onMove: (delta: number) => void }): React.ReactElement {
	return (
		<span className="pk-cc-arrange-row__moves">
			<IconButton className="pk-cc-icon-button" label="Move up" disabled={index === 0} onClick={() => onMove(-1)}><ArrowUp size={14} /></IconButton>
			<IconButton className="pk-cc-icon-button" label="Move down" disabled={index === count - 1} onClick={() => onMove(1)}><ArrowDown size={14} /></IconButton>
		</span>
	);
}

export function CommandCenterArrangeItems({
	group,
	onReorder,
}: {
	group: CommandCenterGroup;
	onReorder: (fromId: string, toId: string) => void;
}): React.ReactElement {
	const items = useMemo(() => group.actions.slice().sort((a, b) => a.order - b.order), [group.actions]);
	const [draggedId, setDraggedId] = useState<string | null>(null);
	const [dropTargetId, setDropTargetId] = useState<string | null>(null);
	const reducedMotion = useReducedMotion();
	const move = (itemId: string, delta: number): void => {
		const index = items.findIndex((item) => item.id === itemId);
		const target = items[index + delta];
		if (target) onReorder(itemId, target.id);
	};
	return (
		<div className="pk-cc-secondary-panel">
			<div className="pk-cc-secondary-panel__intro">
				<span>Drag selected actions into the order used by this launcher group.</span>
			</div>
			<div className="pk-cc-arrange-list" role="list" aria-label={`Action order for ${group.label}`}>
				{items.map((item, index) => (
					<motion.div
						key={item.id}
						className="pk-cc-arrange-row"
						layout="position"
						transition={reducedMotion ? { duration: 0 } : { layout: { type: 'spring', stiffness: 520, damping: 42 } }}
						data-dragging={draggedId === item.id ? 'true' : undefined}
						data-drop-target={dropTargetId === item.id && draggedId !== item.id ? 'true' : undefined}
						data-drop-position={dropTargetId === item.id && draggedId !== item.id && items.findIndex((candidate) => candidate.id === draggedId) < index ? 'after' : 'before'}
						draggable
						onDragStart={(event) => {
							const dragEvent = event as unknown as React.DragEvent<HTMLDivElement>;
							dragEvent.dataTransfer.effectAllowed = 'move';
							dragEvent.dataTransfer.setData('text/plain', item.id);
							dragEvent.dataTransfer.setDragImage(dragEvent.currentTarget, 24, 24);
							setDraggedId(item.id);
						}}
						onDragEnd={() => { setDraggedId(null); setDropTargetId(null); }}
						onDragOver={(event) => {
							event.preventDefault();
							event.dataTransfer.dropEffect = 'move';
							if (draggedId !== item.id) setDropTargetId(item.id);
						}}
						onDrop={(event) => {
							event.preventDefault();
							if (draggedId && draggedId !== item.id) onReorder(draggedId, item.id);
							setDraggedId(null);
							setDropTargetId(null);
						}}
						role="listitem"
					>
						<span className="pk-cc-arrange-row__handle"><GripVertical size={15} /><span>{index + 1}</span></span>
						<span className="pk-cc-arrange-row__icon"><CommandCenterIcon icon={item.icon} size={16} /></span>
						<span className="pk-cc-arrange-row__copy"><span>{item.shortLabel}</span><span>{DISPLAY_LABELS[item.display]}</span></span>
						<MoveButtons index={index} count={items.length} onMove={(delta) => move(item.id, delta)} />
					</motion.div>
				))}
				{items.length === 0 ? <span className="pk-cc-secondary-panel__empty">Add actions from the directory first.</span> : null}
			</div>
		</div>
	);
}

export function CommandCenterHomeSettings({
	config,
	onChange,
}: {
	config: CommandCenterBoardConfig;
	onChange: (mutate: (next: CommandCenterBoardConfig) => void) => void;
}): React.ReactElement {
	return (
		<div className="pk-cc-secondary-panel">
			<div className="pk-cc-secondary-panel__intro">
				<span>Choose when the full Home workspace appears. These settings apply globally, not to one group.</span>
			</div>
			<div className="pk-cc-setting-list">
				<div className="pk-cc-setting-row">
					<span><span>Open Command Center Home when Obsidian starts</span><span>Opens the Home view after the workspace layout is ready.</span></span>
					<Toggle checked={config.home.openOnStartup} label="Open Command Center Home when Obsidian starts" onCheckedChange={(checked) => onChange((next) => { next.home.openOnStartup = checked; })} />
				</div>
				<div className="pk-cc-setting-row">
					<span><span>Show Command Center Home in new empty tabs</span><span>Replaces a newly activated empty leaf with the Home view.</span></span>
					<Toggle checked={config.home.replaceEmptyTab} label="Show Command Center Home in new empty tabs" onCheckedChange={(checked) => onChange((next) => { next.home.replaceEmptyTab = checked; })} />
				</div>
			</div>
		</div>
	);
}
