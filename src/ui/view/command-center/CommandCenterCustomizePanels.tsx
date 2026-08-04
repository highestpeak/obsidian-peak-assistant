import React, { useEffect, useMemo, useState } from 'react';
import { ArrowDown, ArrowUp, GripVertical, House } from 'lucide-react';
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
	{ value: 'icon-label', label: 'Icon + label' },
	{ value: 'icon-only', label: 'Icon only' },
	{ value: 'text-only', label: 'Text only' },
];

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
	const [nameDraft, setNameDraft] = useState(item.shortLabel);
	const [aliasesDraft, setAliasesDraft] = useState(item.aliases.join(', '));
	const [iconOpen, setIconOpen] = useState(false);
	useEffect(() => {
		setNameDraft(item.shortLabel);
		setAliasesDraft(item.aliases.join(', '));
		setIconOpen(false);
	}, [item.id]);

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
	const displayOptions = DISPLAY_OPTIONS.filter((option) => option.value !== 'icon-only' || item.icon);

	return (
		<div className="pk-cc-item-editor">
			<label>
				<span>Name</span>
				<input value={nameDraft} onChange={(event) => setNameDraft(event.target.value)} onBlur={commitName} onKeyDown={(event) => onDraftKeyDown(event, () => setNameDraft(item.shortLabel))} />
			</label>
			<label>
				<span>Aliases</span>
				<input value={aliasesDraft} placeholder="Separate with commas" onChange={(event) => setAliasesDraft(event.target.value)} onBlur={commitAliases} onKeyDown={(event) => onDraftKeyDown(event, () => setAliasesDraft(item.aliases.join(', ')))} />
			</label>
			<div className="pk-cc-item-editor__row">
				<span>Display</span>
				<Segmented value={item.display} onValueChange={(mode) => onUpdate((target) => { target.display = mode; })} options={displayOptions} size="sm" aria-label="Display mode" />
			</div>
			<div className="pk-cc-item-editor__row">
				<span>Icon</span>
				<Button variant="secondary" size="sm" className="pk-cc-icon-picker-trigger" onClick={() => setIconOpen((open) => !open)}>
					<CommandCenterIcon icon={item.icon} size={15} />
					<span>{item.icon?.kind === 'lucide' ? item.icon.name : item.icon?.value ?? 'Choose icon'}</span>
				</Button>
			</div>
			<div className="pk-cc-item-editor__row">
				<span>Pin to Home</span>
				<Toggle checked={item.pinnedToHome} label={`Pin ${item.shortLabel} to Home`} onCheckedChange={onPin} />
			</div>
			{iconOpen ? (
				<IconBrowser
					value={item.icon}
					onChange={(icon: CommandCenterItemIcon | undefined) => onUpdate((target) => {
						target.icon = icon;
						if (!icon && target.display === 'icon-only') target.display = 'text-only';
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
					<div
						key={item.id}
						className="pk-cc-arrange-row"
						draggable
						onDragStart={() => setDraggedId(item.id)}
						onDragEnd={() => setDraggedId(null)}
						onDragOver={(event) => event.preventDefault()}
						onDrop={() => {
							if (draggedId && draggedId !== item.id) onReorder(draggedId, item.id);
							setDraggedId(null);
						}}
						role="listitem"
					>
						<span className="pk-cc-arrange-row__handle"><GripVertical size={15} /><span>{index + 1}</span></span>
						<span className="pk-cc-arrange-row__icon"><CommandCenterIcon icon={item.icon} size={16} /></span>
						<span className="pk-cc-arrange-row__copy"><span>{item.shortLabel}</span><span>{['vault-target', 'bookmark', 'workspace', 'view'].includes(item.action.kind) ? 'Link' : item.display === 'text-only' ? 'Text row' : item.display === 'icon-only' ? 'Icon only' : 'Icon grid'}</span></span>
						<MoveButtons index={index} count={items.length} onMove={(delta) => move(item.id, delta)} />
					</div>
				))}
				{items.length === 0 ? <span className="pk-cc-secondary-panel__empty">Add actions from the directory first.</span> : null}
			</div>
		</div>
	);
}

export function CommandCenterArrangeTabs({
	config,
	onReorder,
}: {
	config: CommandCenterBoardConfig;
	onReorder: (fromId: string | 'all', toId: string | 'all') => void;
}): React.ReactElement {
	const groupById = useMemo(() => new Map(config.groups.map((group) => [group.id, group])), [config.groups]);
	const tabs = config.modal.tabOrder.filter((tab) => tab === 'all' || groupById.has(tab));
	const [draggedId, setDraggedId] = useState<string | 'all' | null>(null);
	const move = (tabId: string | 'all', delta: number): void => {
		const index = tabs.indexOf(tabId);
		const target = tabs[index + delta];
		if (target) onReorder(tabId, target);
	};
	return (
		<div className="pk-cc-secondary-panel">
			<div className="pk-cc-secondary-panel__intro">
				<span>The first tab opens by default. Drag All and your groups into the order you want.</span>
			</div>
			<div className="pk-cc-arrange-list" role="list" aria-label="Launcher tab order">
				{tabs.map((tabId, index) => {
					const group = tabId === 'all' ? null : groupById.get(tabId);
					return (
						<div
							key={tabId}
							className="pk-cc-arrange-row"
							draggable
							onDragStart={() => setDraggedId(tabId)}
							onDragEnd={() => setDraggedId(null)}
							onDragOver={(event) => event.preventDefault()}
							onDrop={() => {
								if (draggedId && draggedId !== tabId) onReorder(draggedId, tabId);
								setDraggedId(null);
							}}
							role="listitem"
						>
							<span className="pk-cc-arrange-row__handle"><GripVertical size={15} /><span>{index + 1}</span></span>
							<span className="pk-cc-arrange-row__icon">{group ? <CommandCenterIcon icon={group.icon} size={16} /> : <House size={16} />}</span>
							<span className="pk-cc-arrange-row__copy"><span>{group?.label ?? 'All'}</span><span>{index === 0 ? 'Opens first' : tabId === 'all' ? 'Combined groups' : 'Command group'}</span></span>
							<MoveButtons index={index} count={tabs.length} onMove={(delta) => move(tabId, delta)} />
						</div>
					);
				})}
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
