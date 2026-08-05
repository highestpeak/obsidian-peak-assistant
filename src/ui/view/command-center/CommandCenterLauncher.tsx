import React, { useEffect, useMemo, useRef, useState } from 'react';
import { motion, useReducedMotion } from 'framer-motion';
import { GripVertical, Search, SlidersHorizontal, X } from 'lucide-react';
import {
	buildProjectionPositions,
	COMMAND_CENTER_CATALOG_DEFAULTS,
	commandCenterActionKey,
	moveProjectionFocus,
	prepareCommandCenterGlobalMatches,
	resolveAutoCommandCenterDisplayMode,
	type CommandCenterCatalogEntry,
	type CommandCenterDropPlacement,
	type CommandCenterGroup,
	type CommandCenterRuntimePort,
	type CommandCenterTabId,
	type ProjectionPosition,
	type ResolvedCommandCenterDisplayMode,
	type ResolvedCommandCenterItem,
} from '@/core/command-center';
import { Button, IconButton, Pill } from '@/ui/components/primitives';
import {
	CommandCenterGlobalResults,
	SHOW_ALL_COMMANDS_ID,
	commandCenterCatalogFocusId,
} from './CommandCenterGlobalResults';
import { CommandCenterIcon } from './CommandCenterIcon';

export interface CommandCenterLauncherProps {
	runtime: CommandCenterRuntimePort;
	onCustomize: () => void;
	onClose: () => void;
}

interface DropTarget {
	groupId: string;
	itemId: string | null;
	placement: CommandCenterDropPlacement;
	axis: 'column' | 'row';
}

interface TabDropTarget {
	tabId: CommandCenterTabId;
	placement: CommandCenterDropPlacement;
}

function useRuntimeConfig(runtime: CommandCenterRuntimePort) {
	const [config, setConfig] = useState(() => runtime.getConfig());
	useEffect(() => runtime.subscribe(() => setConfig(runtime.getConfig())), [runtime]);
	return config;
}

function modeColumnLabel(mode: ResolvedCommandCenterDisplayMode): string {
	if (mode === 'compact') return '3';
	if (mode === 'wide') return '2';
	if (mode === 'full') return '1';
	return 'icon';
}

function ActionContent({ item, mode }: {
	item: ResolvedCommandCenterItem;
	mode: ResolvedCommandCenterDisplayMode;
}): React.ReactElement {
	const iconMode = mode === 'icon';
	const trailing = item.hotkey
		? <kbd>{item.hotkey}</kbd>
		: item.display === 'auto'
			? <span className="pk-cc-action__auto">Auto · {modeColumnLabel(mode)}</span>
			: null;
	return (
		<>
			{item.icon ? <span className="pk-cc-action__icon"><CommandCenterIcon icon={item.icon} size={iconMode ? 19 : 15} /></span> : null}
			<span className="pk-cc-action__label">{item.shortLabel}</span>
			<span className="pk-cc-action__end">{trailing}<GripVertical className="pk-cc-action__grip" size={13} aria-hidden="true" /></span>
		</>
	);
}

function ActionButton({ item, mode, active, onFocus, onInvoke }: {
	item: ResolvedCommandCenterItem;
	mode: ResolvedCommandCenterDisplayMode;
	active: boolean;
	onFocus: () => void;
	onInvoke: () => void;
}): React.ReactElement {
	const title = [item.fullLabel, item.hotkey, item.unavailableReason].filter(Boolean).join(' · ');
	return (
		<Button
			variant="ghost"
			size="sm"
			className={`pk-cc-action pk-cc-action--${mode}`}
			data-action-id={item.id}
			data-active={active ? 'true' : 'false'}
			data-has-icon={item.icon ? 'true' : undefined}
			aria-label={item.shortLabel}
			aria-disabled={!item.available}
			disabled={!item.available}
			title={title}
			onMouseEnter={onFocus}
			onFocus={onFocus}
			onClick={onInvoke}
		>
			<ActionContent item={item} mode={mode} />
		</Button>
	);
}

function dropClassName(dropTarget: DropTarget | null, item: ResolvedCommandCenterItem): string {
	if (dropTarget?.itemId !== item.id) return '';
	return ` pk-cc-item-slot--drop-${dropTarget.placement}-${dropTarget.axis}`;
}

function ProjectionSection({
	group,
	items,
	resolvedModes,
	showGroupLabel,
	activeId,
	draggedId,
	dropTarget,
	dragEnabled,
	reducedMotion,
	onFocus,
	onInvoke,
	onDragStart,
	onDragOverItem,
	onDragOverGrid,
	onDrop,
	onDragEnd,
}: {
	group: CommandCenterGroup;
	items: ResolvedCommandCenterItem[];
	resolvedModes: Map<string, ResolvedCommandCenterDisplayMode>;
	showGroupLabel: boolean;
	activeId: string | null;
	draggedId: string | null;
	dropTarget: DropTarget | null;
	dragEnabled: boolean;
	reducedMotion: boolean;
	onFocus: (id: string) => void;
	onInvoke: (item: ResolvedCommandCenterItem) => void;
	onDragStart: (event: React.DragEvent<HTMLDivElement>, item: ResolvedCommandCenterItem) => void;
	onDragOverItem: (event: React.DragEvent<HTMLDivElement>, item: ResolvedCommandCenterItem, mode: ResolvedCommandCenterDisplayMode) => void;
	onDragOverGrid: (event: React.DragEvent<HTMLDivElement>, groupId: string) => void;
	onDrop: (event: React.DragEvent<HTMLDivElement>) => void;
	onDragEnd: () => void;
}): React.ReactElement | null {
	if (items.length === 0 && !draggedId) return null;
	return (
		<div className="pk-cc-section" data-group-id={group.id}>
			{showGroupLabel ? <span className="pk-cc-section__label"><span>{group.label}</span><span>{items.length}</span></span> : null}
			<div
				className={`pk-cc-mixed-grid${dropTarget?.groupId === group.id && dropTarget.itemId === null ? ' pk-cc-mixed-grid--drop-target' : ''}`}
				role="group"
				aria-label={`${group.label} actions`}
				onDragOver={(event) => onDragOverGrid(event, group.id)}
				onDrop={onDrop}
			>
				{items.map((item) => {
					const mode = resolvedModes.get(item.id) ?? 'full';
					return (
						<motion.div
							key={item.id}
							layoutId={`command-center-item-${item.id}`}
							className={`pk-cc-item-slot pk-cc-item-slot--${mode}${dropClassName(dropTarget, item)}`}
							layout="position"
							transition={reducedMotion ? { duration: 0 } : { layout: { type: 'spring', stiffness: 520, damping: 42 } }}
							data-item-id={item.id}
							data-group-id={group.id}
							data-dragging={draggedId === item.id ? 'true' : undefined}
							draggable={dragEnabled}
							onDragStart={(event) => onDragStart(event as unknown as React.DragEvent<HTMLDivElement>, item)}
							onDragOver={(event) => onDragOverItem(event, item, mode)}
							onDrop={onDrop}
							onDragEnd={onDragEnd}
						>
							<ActionButton item={item} mode={mode} active={item.id === activeId} onFocus={() => onFocus(item.id)} onInvoke={() => onInvoke(item)} />
						</motion.div>
					);
				})}
			</div>
		</div>
	);
}

export function CommandCenterLauncher({ runtime, onCustomize, onClose }: CommandCenterLauncherProps): React.ReactElement {
	const config = useRuntimeConfig(runtime);
	const reducedMotion = useReducedMotion();
	const groups = useMemo(() => config.groups.slice().sort((a, b) => a.order - b.order), [config.groups]);
	const groupById = useMemo(() => new Map(groups.map((group) => [group.id, group])), [groups]);
	const tabOrder = useMemo(() => config.modal.tabOrder.filter((entry) => entry === 'all' || groupById.has(entry)), [config.modal.tabOrder, groupById]);
	const [scope, setScope] = useState<string | 'all'>(() => tabOrder[0] ?? 'all');
	const [query, setQuery] = useState('');
	const [items, setItems] = useState<ResolvedCommandCenterItem[]>([]);
	const [allCommandMatches, setAllCommandMatches] = useState<CommandCenterCatalogEntry[]>([]);
	const [showAllCommands, setShowAllCommands] = useState(false);
	const [searchLoading, setSearchLoading] = useState(false);
	const [activeId, setActiveId] = useState<string | null>(null);
	const [gridWidth, setGridWidth] = useState(560);
	const [draggedId, setDraggedId] = useState<string | null>(null);
	const [dropTarget, setDropTarget] = useState<DropTarget | null>(null);
	const [draggedTabId, setDraggedTabId] = useState<CommandCenterTabId | null>(null);
	const [tabDropTarget, setTabDropTarget] = useState<TabDropTarget | null>(null);
	const searchActive = Boolean(query.trim());
	const inputRef = useRef<HTMLInputElement>(null);
	const rootRef = useRef<HTMLDivElement>(null);
	const projectionRef = useRef<HTMLDivElement>(null);
	const dragGhostRef = useRef<HTMLElement | null>(null);
	const tabDragGhostRef = useRef<HTMLElement | null>(null);
	const suppressClickRef = useRef(false);
	const changeQuery = (nextQuery: string): void => {
		setQuery(nextQuery);
		setShowAllCommands(false);
		setSearchLoading(Boolean(nextQuery.trim()));
	};

	useEffect(() => {
		if (tabOrder.includes(scope)) return;
		setScope(tabOrder[0] ?? 'all');
	}, [scope, tabOrder]);

	useEffect(() => {
		let cancelled = false;
		const normalizedQuery = query.trim();
		setSearchLoading(Boolean(normalizedQuery));
		const catalogPromise = normalizedQuery
			? runtime.getCatalog(query, 'commands').catch((error) => {
				console.error('[Peak Command Center] Failed to search the complete command catalog.', error);
				return [] as CommandCenterCatalogEntry[];
			})
			: Promise.resolve([] as CommandCenterCatalogEntry[]);
		void Promise.all([runtime.resolveItems(scope, query), catalogPromise])
			.then(([nextItems, catalog]) => {
				if (cancelled) return;
				const configuredKeys = new Set(nextItems.map((item) => commandCenterActionKey(item.action)));
				setItems(nextItems);
				setAllCommandMatches(prepareCommandCenterGlobalMatches(catalog, configuredKeys, query));
				setSearchLoading(false);
			})
			.catch((error) => {
				if (cancelled) return;
				console.error('[Peak Command Center] Failed to resolve launcher search.', error);
				setItems([]);
				setAllCommandMatches([]);
				setSearchLoading(false);
			});
		return () => { cancelled = true; };
	}, [runtime, scope, query, config]);
	const sections = useMemo(() => {
		const visibleGroups = scope === 'all' ? groups : groups.filter((group) => group.id === scope);
		return visibleGroups.map((group) => ({ group, items: items.filter((item) => item.groupId === group.id) }));
	}, [groups, items, scope]);

	const resolvedModes = useMemo(() => {
		const resolved = new Map<string, ResolvedCommandCenterDisplayMode>();
		const ownerDocument = rootRef.current?.ownerDocument;
		const context = ownerDocument?.createElement('canvas').getContext('2d') ?? null;
		if (context) {
			const rootStyle = rootRef.current ? ownerDocument?.defaultView?.getComputedStyle(rootRef.current) : null;
			context.font = `510 11px ${rootStyle?.fontFamily ?? '-apple-system, BlinkMacSystemFont, Inter, sans-serif'}`;
		}
		for (const item of items) {
			if (item.display !== 'auto') {
				resolved.set(item.id, item.display);
				continue;
			}
			const textWidth = context?.measureText(item.shortLabel).width ?? item.shortLabel.length * 6;
			resolved.set(item.id, resolveAutoCommandCenterDisplayMode(textWidth, gridWidth));
		}
		return resolved;
	}, [gridWidth, items]);

	const visibleGlobalMatches = useMemo(() => showAllCommands
		? allCommandMatches
		: allCommandMatches.slice(0, COMMAND_CENTER_CATALOG_DEFAULTS.launcherCommandPreviewLimit), [allCommandMatches, showAllCommands]);
	const canToggleGlobalMatches = allCommandMatches.length > COMMAND_CENTER_CATALOG_DEFAULTS.launcherCommandPreviewLimit;
	const positions = useMemo(() => {
		const configuredPositions = buildProjectionPositions(sections.map(({ group, items: groupItems }) => ({
			sectionId: group.id,
			items: groupItems.map((item) => ({ id: item.id, mode: resolvedModes.get(item.id) ?? 'full' })),
		})));
		const rowOffset = configuredPositions.reduce((maximum, position) => Math.max(maximum, position.row + position.rowSpan), 0) + 1;
		const globalPositions: ProjectionPosition[] = visibleGlobalMatches.map((entry, index) => ({
			id: commandCenterCatalogFocusId(entry),
			sectionId: 'all-commands',
			row: rowOffset + index,
			rowSpan: 1,
			column: 0,
			columnSpan: 30,
		}));
		if (canToggleGlobalMatches) {
			globalPositions.push({
				id: SHOW_ALL_COMMANDS_ID,
				sectionId: 'all-commands',
				row: rowOffset + visibleGlobalMatches.length,
				rowSpan: 1,
				column: 0,
				columnSpan: 30,
			});
		}
		return [...configuredPositions, ...globalPositions];
	}, [canToggleGlobalMatches, resolvedModes, sections, visibleGlobalMatches]);
	const activeItem = items.find((item) => item.id === activeId) ?? null;
	const activeCatalogEntry = visibleGlobalMatches.find((entry) => commandCenterCatalogFocusId(entry) === activeId) ?? null;

	useEffect(() => {
		const selectableIds = new Set(positions.map((position) => position.id));
		setActiveId((current) => current && selectableIds.has(current) ? current : positions[0]?.id ?? null);
	}, [positions]);

	useEffect(() => {
		const projection = projectionRef.current;
		if (!projection) return;
		const updateWidth = (): void => {
			const mixedGrid = projection.querySelector<HTMLElement>('.pk-cc-mixed-grid');
			setGridWidth(Math.max(280, mixedGrid?.getBoundingClientRect().width ?? projection.clientWidth - 24));
		};
		updateWidth();
		const OwnerResizeObserver = projection.ownerDocument.defaultView?.ResizeObserver ?? globalThis.ResizeObserver;
		if (!OwnerResizeObserver) return;
		const observer = new OwnerResizeObserver(updateWidth);
		observer.observe(projection);
		return () => observer.disconnect();
	}, [items.length, scope]);

	useEffect(() => {
		if (!activeId) return;
		const OwnerCSS = rootRef.current?.ownerDocument.defaultView?.CSS;
		const escaped = OwnerCSS?.escape ? OwnerCSS.escape(activeId) : activeId.replace(/"/g, '\\"');
		rootRef.current?.querySelector<HTMLElement>(`[data-action-id="${escaped}"]`)?.scrollIntoView({ block: 'nearest' });
	}, [activeId, showAllCommands]);

	const clearDragState = (): void => {
		dragGhostRef.current?.remove();
		dragGhostRef.current = null;
		setDraggedId(null);
		setDropTarget(null);
	};

	const clearTabDragState = (): void => {
		tabDragGhostRef.current?.remove();
		tabDragGhostRef.current = null;
		setDraggedTabId(null);
		setTabDropTarget(null);
	};

	const invoke = async (item: ResolvedCommandCenterItem): Promise<void> => {
		if (suppressClickRef.current) return;
		const invoked = await runtime.invokeItem(item);
		if (invoked) onClose();
	};

	const invokeCatalogEntry = async (entry: CommandCenterCatalogEntry): Promise<void> => {
		const invoked = await runtime.invokeCatalogEntry(entry);
		if (invoked) onClose();
	};

	const handleDragStart = (event: React.DragEvent<HTMLDivElement>, item: ResolvedCommandCenterItem): void => {
		if (searchActive) {
			event.preventDefault();
			return;
		}
		setActiveId(item.id);
		setDraggedId(item.id);
		event.dataTransfer.effectAllowed = 'move';
		event.dataTransfer.setData('text/plain', item.id);
		const ghost = event.currentTarget.cloneNode(true) as HTMLElement;
		ghost.className = 'pk-cc-drag-ghost';
		ghost.style.width = `${event.currentTarget.getBoundingClientRect().width}px`;
		event.currentTarget.ownerDocument.body.appendChild(ghost);
		dragGhostRef.current = ghost;
		event.dataTransfer.setDragImage(ghost, Math.min(46, ghost.getBoundingClientRect().width / 2), 20);
	};

	const handleDragOverItem = (
		event: React.DragEvent<HTMLDivElement>,
		item: ResolvedCommandCenterItem,
		mode: ResolvedCommandCenterDisplayMode,
	): void => {
		if (!draggedId || searchActive) return;
		event.preventDefault();
		event.stopPropagation();
		event.dataTransfer.dropEffect = 'move';
		if (item.id === draggedId) {
			setDropTarget(null);
			return;
		}
		const rect = event.currentTarget.getBoundingClientRect();
		const axis = mode === 'full' ? 'row' : 'column';
		const after = axis === 'row'
			? event.clientY > rect.top + rect.height / 2
			: event.clientX > rect.left + rect.width / 2;
		setDropTarget({ groupId: item.groupId, itemId: item.id, placement: after ? 'after' : 'before', axis });
	};

	const handleDragOverGrid = (event: React.DragEvent<HTMLDivElement>, groupId: string): void => {
		if (!draggedId || searchActive || event.target !== event.currentTarget) return;
		event.preventDefault();
		event.dataTransfer.dropEffect = 'move';
		setDropTarget({ groupId, itemId: null, placement: 'after', axis: 'row' });
	};

	const handleDrop = (event: React.DragEvent<HTMLDivElement>): void => {
		event.preventDefault();
		event.stopPropagation();
		if (!draggedId || !dropTarget || searchActive) {
			clearDragState();
			return;
		}
		const { groupId, itemId, placement } = dropTarget;
		suppressClickRef.current = true;
		void runtime.moveItem(draggedId, groupId, itemId, placement).catch((error) => {
			console.error('[Peak Command Center] Failed to reorder launcher item.', error);
		});
		rootRef.current?.ownerDocument.defaultView?.setTimeout(() => { suppressClickRef.current = false; }, 120);
		clearDragState();
	};

	const handleTabDragStart = (event: React.DragEvent<HTMLDivElement>, tabId: CommandCenterTabId): void => {
		setDraggedTabId(tabId);
		event.dataTransfer.effectAllowed = 'move';
		event.dataTransfer.setData('text/plain', tabId);
		const ghost = event.currentTarget.cloneNode(true) as HTMLElement;
		ghost.className = 'pk-cc-tab-drag-ghost';
		ghost.style.width = `${event.currentTarget.getBoundingClientRect().width}px`;
		event.currentTarget.ownerDocument.body.appendChild(ghost);
		tabDragGhostRef.current = ghost;
		event.dataTransfer.setDragImage(ghost, Math.min(40, ghost.getBoundingClientRect().width / 2), 18);
	};

	const handleTabDragOver = (event: React.DragEvent<HTMLDivElement>, tabId: CommandCenterTabId): void => {
		if (!draggedTabId) return;
		event.preventDefault();
		event.stopPropagation();
		event.dataTransfer.dropEffect = 'move';
		if (draggedTabId === tabId) {
			setTabDropTarget(null);
			return;
		}
		const rect = event.currentTarget.getBoundingClientRect();
		setTabDropTarget({ tabId, placement: event.clientX > rect.left + rect.width / 2 ? 'after' : 'before' });
	};

	const handleTabDrop = (event: React.DragEvent<HTMLDivElement>): void => {
		event.preventDefault();
		event.stopPropagation();
		if (!draggedTabId || !tabDropTarget) {
			clearTabDragState();
			return;
		}
		const { tabId: targetTabId, placement } = tabDropTarget;
		suppressClickRef.current = true;
		void runtime.moveTab(draggedTabId, targetTabId, placement).catch((error) => {
			console.error('[Peak Command Center] Failed to reorder launcher tab.', error);
		});
		rootRef.current?.ownerDocument.defaultView?.setTimeout(() => { suppressClickRef.current = false; }, 120);
		clearTabDragState();
	};

	const focusSearch = (): void => inputRef.current?.focus();

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
			rootRef.current?.ownerDocument.defaultView?.setTimeout(() => runtime.openNativeCommandPalette(), 0);
			return;
		}
		if (event.key === 'Escape') {
			event.preventDefault();
			event.stopPropagation();
			if (query) {
				changeQuery('');
				return;
			}
			onClose();
			return;
		}
		if (event.key === 'Enter') {
			if (searchLoading) {
				event.preventDefault();
				return;
			}
			if (activeItem) {
				event.preventDefault();
				void invoke(activeItem);
				return;
			}
			if (activeCatalogEntry) {
				event.preventDefault();
				void invokeCatalogEntry(activeCatalogEntry);
				return;
			}
			if (activeId === SHOW_ALL_COMMANDS_ID) {
				event.preventDefault();
				setShowAllCommands((current) => !current);
				return;
			}
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
		if (event.key.length !== 1 || commandKey || event.altKey || event.target === inputRef.current) return;
		focusSearch();
		changeQuery(`${query}${event.key}`);
	};

	return (
		<div className="pk-cc-launcher" ref={rootRef} onKeyDown={handleKeyDown} tabIndex={-1}>
			<div className="pk-cc-search-row">
				<Search size={16} aria-hidden="true" />
				<input ref={inputRef} value={query} onChange={(event) => changeQuery(event.target.value)} placeholder="Search commands and your Command Center" aria-label="Search configured and all commands" autoFocus />
				{query ? <IconButton className="pk-cc-icon-button" label="Clear search" onClick={() => changeQuery('')}><X size={14} /></IconButton> : null}
				<IconButton className="pk-cc-icon-button" label="Close Command Center" onClick={onClose}><X size={16} /></IconButton>
			</div>

			<div className="pk-cc-groups" role="tablist" aria-label="Command groups">
				{tabOrder.map((tab) => {
					const group = tab === 'all' ? null : groupById.get(tab);
					if (tab !== 'all' && !group) return null;
					const dropPlacement = tabDropTarget?.tabId === tab ? tabDropTarget.placement : null;
					return (
						<motion.div
							key={tab}
							className="pk-cc-tab-slot"
							layout="position"
							transition={reducedMotion ? { duration: 0 } : { layout: { type: 'spring', stiffness: 520, damping: 42 } }}
							data-dragging={draggedTabId === tab ? 'true' : undefined}
							data-drop-placement={dropPlacement ?? undefined}
							draggable
							onDragStart={(event) => handleTabDragStart(event as unknown as React.DragEvent<HTMLDivElement>, tab)}
							onDragOver={(event) => handleTabDragOver(event, tab)}
							onDrop={handleTabDrop}
							onDragEnd={clearTabDragState}
						>
							<Pill className="pk-cc-group-tab" selected={scope === tab} role="tab" aria-selected={scope === tab} onClick={() => {
								if (!suppressClickRef.current) setScope(tab);
							}}>
								{group ? <CommandCenterIcon icon={group.icon} size={15} /> : null}
								<span>{group?.label ?? 'All'}</span>
								<GripVertical className="pk-cc-group-tab__grip" size={11} aria-hidden="true" />
							</Pill>
						</motion.div>
					);
				})}
			</div>

			<div className="pk-cc-projection" ref={projectionRef} key={scope}>
				{searchActive && items.length > 0 ? <span className="pk-cc-query-section-head"><span>Your Command Center</span><span>{items.length}</span></span> : null}
				{sections.map(({ group, items: groupItems }) => (
					<ProjectionSection
						key={group.id}
						group={group}
						items={groupItems}
						resolvedModes={resolvedModes}
						showGroupLabel={scope === 'all'}
						activeId={activeId}
						draggedId={draggedId}
						dropTarget={dropTarget}
						dragEnabled={!searchActive}
						reducedMotion={Boolean(reducedMotion)}
						onFocus={setActiveId}
						onInvoke={(item) => void invoke(item)}
						onDragStart={handleDragStart}
						onDragOverItem={handleDragOverItem}
						onDragOverGrid={handleDragOverGrid}
						onDrop={handleDrop}
						onDragEnd={clearDragState}
					/>
				))}
				{searchActive ? (
					<CommandCenterGlobalResults
						entries={visibleGlobalMatches}
						total={allCommandMatches.length}
						expanded={showAllCommands}
						activeId={activeId}
						onFocus={setActiveId}
						onInvoke={(entry) => void invokeCatalogEntry(entry)}
						onToggle={() => setShowAllCommands((current) => !current)}
					/>
				) : null}
				{searchLoading && items.length === 0 && allCommandMatches.length === 0 ? <div className="pk-cc-empty"><span>Searching commands…</span></div> : null}
				{!searchLoading && items.length === 0 && allCommandMatches.length === 0 ? (
					<div className="pk-cc-empty">
						<span>{searchActive ? 'No commands match this search.' : 'This group is empty.'}</span>
						<Button variant="secondary" size="sm" onClick={onCustomize}>Customize</Button>
					</div>
				) : null}
			</div>

			<div className="pk-cc-footer">
				<span className="pk-cc-footer__hint"><kbd>↑↓←→</kbd> move <span className="pk-cc-footer__drag"><GripVertical size={12} /> drag to reorder</span> <kbd>↵</kbd> open <kbd>esc</kbd> close</span>
				<span className="pk-cc-footer__scope">{activeItem?.fullLabel ?? activeCatalogEntry?.label ?? (searchActive ? 'Clear search to reorder' : '')}</span>
				<Button variant="ghost" size="sm" className="pk-cc-footer__action" onClick={onCustomize}><SlidersHorizontal size={14} /><span>Customize</span></Button>
			</div>
		</div>
	);
}
