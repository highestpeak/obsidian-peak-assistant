import React, { useEffect, useMemo, useRef, useState } from 'react';
import { ArrowUpRight, Search, SlidersHorizontal, X } from 'lucide-react';
import {
	buildProjectionPositions,
	moveProjectionFocus,
	projectCommandCenterItems,
	type CommandCenterGroup,
	type CommandCenterRuntimePort,
	type ResolvedCommandCenterItem,
} from '@/core/command-center';
import { Button, IconButton, Pill } from '@/ui/components/primitives';
import { CommandCenterIcon } from './CommandCenterIcon';

export interface CommandCenterLauncherProps {
	runtime: CommandCenterRuntimePort;
	onCustomize: () => void;
	onClose: () => void;
}

function useRuntimeConfig(runtime: CommandCenterRuntimePort) {
	const [config, setConfig] = useState(() => runtime.getConfig());
	useEffect(() => runtime.subscribe(() => setConfig(runtime.getConfig())), [runtime]);
	return config;
}

function GroupTab({ group, selected, onSelect }: {
	group: CommandCenterGroup;
	selected: boolean;
	onSelect: () => void;
}): React.ReactElement {
	return (
		<Pill className="pk-cc-group-tab" selected={selected} role="tab" aria-selected={selected} onClick={onSelect}>
			<CommandCenterIcon icon={group.icon} size={15} />
			<span>{group.label}</span>
		</Pill>
	);
}

type ProjectionKind = 'link' | 'grid' | 'row';

function ActionContent({ item, kind }: { item: ResolvedCommandCenterItem; kind: ProjectionKind }): React.ReactElement {
	const row = kind === 'row';
	const link = kind === 'link';
	const showIcon = item.display !== 'text-only' && item.icon;
	const showLabel = item.display !== 'icon-only' || !item.icon;
	return (
		<>
			{showIcon ? <CommandCenterIcon icon={item.icon} size={link ? 14 : row ? 16 : 19} /> : null}
			{showLabel ? <span className="pk-cc-action__label">{item.shortLabel}</span> : null}
			{link && showLabel ? <ArrowUpRight className="pk-cc-action__link-arrow" size={12} aria-hidden="true" /> : null}
			{row ? <span className="pk-cc-action__source">{item.sourceLabel}</span> : null}
			{row && item.hotkey ? <kbd>{item.hotkey}</kbd> : null}
		</>
	);
}

function ActionButton({ item, kind, active, onFocus, onInvoke }: {
	item: ResolvedCommandCenterItem;
	kind: ProjectionKind;
	active: boolean;
	onFocus: () => void;
	onInvoke: () => void;
}): React.ReactElement {
	const title = [item.fullLabel, item.hotkey, item.unavailableReason].filter(Boolean).join(' · ');
	return (
		<Button
			variant="ghost"
			size="sm"
			className={`pk-cc-action pk-cc-action--${kind}`}
			data-action-id={item.id}
			data-active={active ? 'true' : 'false'}
			aria-label={item.shortLabel}
			aria-disabled={!item.available}
			disabled={!item.available}
			title={title}
			onMouseEnter={onFocus}
			onFocus={onFocus}
			onClick={onInvoke}
		>
			<ActionContent item={item} kind={kind} />
		</Button>
	);
}

function ProjectionSection({
	group,
	items,
	showGroupLabel,
	destinationColumns,
	activeId,
	onFocus,
	onInvoke,
}: {
	group: CommandCenterGroup;
	items: ResolvedCommandCenterItem[];
	showGroupLabel: boolean;
	destinationColumns: number;
	activeId: string | null;
	onFocus: (id: string) => void;
	onInvoke: (item: ResolvedCommandCenterItem) => void;
}): React.ReactElement | null {
	if (items.length === 0) return null;
	const projection = projectCommandCenterItems(items, group.actionLayout);
	const render = (item: ResolvedCommandCenterItem, kind: ProjectionKind): React.ReactElement => (
		<ActionButton
			key={item.id}
			item={item}
			kind={kind}
			active={item.id === activeId}
			onFocus={() => onFocus(item.id)}
			onInvoke={() => onInvoke(item)}
		/>
	);
	return (
		<div className="pk-cc-section" data-group-id={group.id}>
			{showGroupLabel ? <span className="pk-cc-section__label">{group.label}</span> : null}
			{projection.blocks.map((block, index) => {
				if (block.kind === 'destination') return <div key={`destination-${index}`} className="pk-cc-links" role="group" aria-label={`${group.label} destinations`} style={{ gridTemplateColumns: `repeat(${destinationColumns}, minmax(0, 1fr))` }}>{block.items.map((item) => render(item, 'link'))}</div>;
				if (block.kind === 'grid') return <div key={`grid-${index}`} className="pk-cc-grid" role="group" aria-label={`${group.label} visual commands`}>{block.items.map((item) => render(item, 'grid'))}</div>;
				return <div key={`row-${index}`} className="pk-cc-rows" role="group" aria-label={`${group.label} commands`}>{block.items.map((item) => render(item, 'row'))}</div>;
			})}
		</div>
	);
}

export function CommandCenterLauncher({ runtime, onCustomize, onClose }: CommandCenterLauncherProps): React.ReactElement {
	const config = useRuntimeConfig(runtime);
	const groups = useMemo(() => config.groups.slice().sort((a, b) => a.order - b.order), [config.groups]);
	const groupById = useMemo(() => new Map(groups.map((group) => [group.id, group])), [groups]);
	const tabOrder = useMemo(() => config.modal.tabOrder.filter((scope) => scope === 'all' || groupById.has(scope)), [config.modal.tabOrder, groupById]);
	const [scope, setScope] = useState<string | 'all'>(() => tabOrder[0] ?? 'all');
	const [query, setQuery] = useState('');
	const [items, setItems] = useState<ResolvedCommandCenterItem[]>([]);
	const [activeId, setActiveId] = useState<string | null>(null);
	const [destinationColumns, setDestinationColumns] = useState(3);
	const inputRef = useRef<HTMLInputElement>(null);
	const rootRef = useRef<HTMLDivElement>(null);

	useEffect(() => {
		if (tabOrder.includes(scope)) return;
		setScope(tabOrder[0] ?? 'all');
	}, [scope, tabOrder]);

	useEffect(() => {
		let cancelled = false;
		void runtime.resolveItems(scope, query).then((next) => {
			if (cancelled) return;
			setItems(next);
			setActiveId((current) => next.some((item) => item.id === current) ? current : next[0]?.id ?? null);
		});
		return () => { cancelled = true; };
	}, [runtime, scope, query, config]);

	const sections = useMemo(() => {
		const visibleGroups = scope === 'all' ? groups : groups.filter((group) => group.id === scope);
		return visibleGroups.map((group) => ({
			group,
			items: items.filter((item) => item.groupId === group.id),
		}));
	}, [groups, items, scope]);
	const positions = useMemo(() => sections.flatMap(({ group, items: groupItems }) =>
		buildProjectionPositions(projectCommandCenterItems(groupItems, group.actionLayout), destinationColumns, group.id)),
	[sections, destinationColumns]);
	const activeItem = items.find((item) => item.id === activeId) ?? null;

	useEffect(() => {
		const root = rootRef.current;
		if (!root) return;
		const updateColumns = (): void => {
			const width = root.getBoundingClientRect().width;
			setDestinationColumns(width < 340 ? 1 : width < 520 ? 2 : 3);
		};
		updateColumns();
		const OwnerResizeObserver = root.ownerDocument.defaultView?.ResizeObserver ?? globalThis.ResizeObserver;
		if (!OwnerResizeObserver) return;
		const observer = new OwnerResizeObserver(updateColumns);
		observer.observe(root);
		return () => observer.disconnect();
	}, []);

	useEffect(() => {
		if (!activeId) return;
		const escaped = typeof CSS !== 'undefined' && CSS.escape ? CSS.escape(activeId) : activeId.replace(/"/g, '\\"');
		rootRef.current?.querySelector<HTMLElement>(`[data-action-id="${escaped}"]`)?.scrollIntoView({ block: 'nearest' });
	}, [activeId]);

	const invoke = async (item: ResolvedCommandCenterItem): Promise<void> => {
		const invoked = await runtime.invokeItem(item);
		if (invoked) onClose();
	};

	const focusSearch = (): void => {
		inputRef.current?.focus();
	};

	const handleKeyDown = (event: React.KeyboardEvent): void => {
		const commandKey = event.metaKey || event.ctrlKey;
		if (commandKey && event.key.toLocaleLowerCase() === 'f') {
			event.preventDefault();
			event.stopPropagation();
			focusSearch();
			return;
		}
		if (commandKey && event.key.toLocaleLowerCase() === 'p') {
			event.preventDefault();
			onClose();
			window.setTimeout(() => runtime.openNativeCommandPalette(), 0);
			return;
		}
		if (event.key === 'Escape') {
			event.preventDefault();
			event.stopPropagation();
			if (query) {
				setQuery('');
				return;
			}
			onClose();
			return;
		}
		if (event.key === 'Enter' && activeItem) {
			event.preventDefault();
			void invoke(activeItem);
			return;
		}
		if (event.key === 'Tab') {
			event.preventDefault();
			const current = Math.max(0, tabOrder.indexOf(scope));
			const delta = event.shiftKey ? -1 : 1;
			const next = (current + delta + tabOrder.length) % tabOrder.length;
			setScope(tabOrder[next] ?? 'all');
			return;
		}
		const direction = ({ ArrowLeft: 'left', ArrowRight: 'right', ArrowUp: 'up', ArrowDown: 'down' } as const)[event.key];
		if (direction) {
			event.preventDefault();
			setActiveId(moveProjectionFocus(positions, activeId, direction));
			return;
		}
		if (event.key === '/') {
			event.preventDefault();
			focusSearch();
			return;
		}
		if (event.key.length !== 1 || commandKey || event.altKey) return;
		if (event.target === inputRef.current) return;
		focusSearch();
		setQuery((current) => `${current}${event.key}`);
	};

	return (
		<div className="pk-cc-launcher" ref={rootRef} onKeyDown={handleKeyDown} tabIndex={-1}>
			<div className="pk-cc-search-row">
				<Search size={16} aria-hidden="true" />
				<input ref={inputRef} value={query} onChange={(event) => setQuery(event.target.value)} placeholder="Search your Command Center" aria-label="Search configured actions" autoFocus />
				{query ? <IconButton className="pk-cc-icon-button" label="Clear search" onClick={() => setQuery('')}><X size={14} /></IconButton> : null}
				<IconButton className="pk-cc-icon-button" label="Close Command Center" onClick={onClose}><X size={16} /></IconButton>
			</div>

			<div className="pk-cc-groups" role="tablist" aria-label="Command groups">
				{tabOrder.map((tab) => tab === 'all' ? (
					<Pill key="all" className="pk-cc-group-tab" selected={scope === 'all'} role="tab" aria-selected={scope === 'all'} onClick={() => setScope('all')}>All</Pill>
				) : groupById.get(tab) ? (
					<GroupTab key={tab} group={groupById.get(tab)!} selected={scope === tab} onSelect={() => setScope(tab)} />
				) : null)}
			</div>

			<div className="pk-cc-projection" key={scope}>
				{sections.map(({ group, items: groupItems }) => (
					<ProjectionSection key={group.id} group={group} items={groupItems} showGroupLabel={scope === 'all'} destinationColumns={destinationColumns} activeId={activeId} onFocus={setActiveId} onInvoke={(item) => void invoke(item)} />
				))}
				{items.length === 0 ? (
					<div className="pk-cc-empty">
						<span>{query ? 'No configured actions match this search.' : 'This group is empty.'}</span>
						<Button variant="secondary" size="sm" onClick={onCustomize}>Customize</Button>
					</div>
				) : null}
			</div>

			<div className="pk-cc-footer">
				<span className="pk-cc-footer__hint"><kbd>↑↓←→</kbd> move <kbd>↵</kbd> open <kbd>esc</kbd> close</span>
				<span className="pk-cc-footer__scope">{query ? `${items.length} in ${scope === 'all' ? 'All' : groupById.get(scope)?.label}` : ''}</span>
				<Button variant="ghost" size="sm" className="pk-cc-footer__action" onClick={onCustomize}><SlidersHorizontal size={14} /><span>Customize</span></Button>
			</div>
		</div>
	);
}
