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

function GroupTab({
	group,
	selected,
	onSelect,
}: {
	group: CommandCenterGroup;
	selected: boolean;
	onSelect: () => void;
}): React.ReactElement {
	return (
		<Pill
			className="pk-cc-group-tab"
			selected={selected}
			role="tab"
			aria-selected={selected}
			onClick={onSelect}
		>
			<CommandCenterIcon icon={group.icon} size={15} />
			<span>{group.label}</span>
		</Pill>
	);
}

type ProjectionKind = 'link' | 'grid' | 'overflow';

function ActionContent({ item, kind }: { item: ResolvedCommandCenterItem; kind: ProjectionKind }): React.ReactElement {
	const overflow = kind === 'overflow';
	const link = kind === 'link';
	const showIcon = item.display !== 'text-only' && item.icon;
	const showLabel = item.display !== 'icon-only' || !item.icon;
	return (
		<>
			{showIcon ? <CommandCenterIcon icon={item.icon} size={link ? 14 : overflow ? 16 : 18} /> : null}
			{showLabel ? <span className="pk-cc-action__label">{item.shortLabel}</span> : null}
			{link && showLabel ? <ArrowUpRight className="pk-cc-action__link-arrow" size={12} aria-hidden="true" /> : null}
			{overflow ? <span className="pk-cc-action__source">{item.fullLabel}</span> : null}
			{overflow && item.hotkey ? <kbd>{item.hotkey}</kbd> : null}
		</>
	);
}

function ActionButton({
	item,
	kind,
	active,
	onFocus,
	onInvoke,
}: {
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

export function CommandCenterLauncher({ runtime, onCustomize, onClose }: CommandCenterLauncherProps): React.ReactElement {
	const config = useRuntimeConfig(runtime);
	const sortedGroups = useMemo(() => config.groups.slice().sort((a, b) => a.order - b.order), [config.groups]);
	const [scope, setScope] = useState<string | 'all'>(() => sortedGroups[0]?.id ?? 'all');
	const [query, setQuery] = useState('');
	const [items, setItems] = useState<ResolvedCommandCenterItem[]>([]);
	const [activeId, setActiveId] = useState<string | null>(null);
	const [destinationColumns, setDestinationColumns] = useState(3);
	const inputRef = useRef<HTMLInputElement>(null);
	const rootRef = useRef<HTMLDivElement>(null);

	useEffect(() => {
		if (scope === 'all' || sortedGroups.some((group) => group.id === scope)) return;
		setScope(sortedGroups[0]?.id ?? 'all');
	}, [scope, sortedGroups]);

	useEffect(() => {
		let cancelled = false;
		void runtime.resolveItems(scope, query).then((next) => {
			if (cancelled) return;
			setItems(next);
			setActiveId((current) => next.some((item) => item.id === current) ? current : next[0]?.id ?? null);
		});
		return () => { cancelled = true; };
	}, [runtime, scope, query, config]);

	const projection = useMemo(() => projectCommandCenterItems(items), [items]);
	const positions = useMemo(() => buildProjectionPositions(projection, destinationColumns), [projection, destinationColumns]);
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

	const handleKeyDown = (event: React.KeyboardEvent): void => {
		if ((event.metaKey || event.ctrlKey) && event.key.toLocaleLowerCase() === 'p') {
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
			const scopes: Array<string | 'all'> = [...sortedGroups.map((group) => group.id), 'all'];
			const current = Math.max(0, scopes.indexOf(scope));
			const delta = event.shiftKey ? -1 : 1;
			const next = (current + delta + scopes.length) % scopes.length;
			setScope(scopes[next]!);
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
			inputRef.current?.focus();
			return;
		}
		if (event.key.length !== 1 || event.metaKey || event.ctrlKey || event.altKey) return;
		if (event.target === inputRef.current) return;
		inputRef.current?.focus();
		setQuery((current) => `${current}${event.key}`);
	};

	return (
		<div className="pk-cc-launcher" ref={rootRef} onKeyDown={handleKeyDown} tabIndex={-1}>
			<div className="pk-cc-search-row">
				<Search size={16} aria-hidden="true" />
				<input
					ref={inputRef}
					value={query}
					onChange={(event) => setQuery(event.target.value)}
					placeholder="Search your Command Center"
					aria-label="Search configured actions"
					autoFocus
				/>
				{query ? (
					<IconButton className="pk-cc-icon-button" label="Clear search" onClick={() => setQuery('')}>
						<X size={14} />
					</IconButton>
				) : null}
				<IconButton className="pk-cc-icon-button" label="Close Command Center" onClick={onClose}>
					<X size={16} />
				</IconButton>
			</div>

			<div className="pk-cc-groups" role="tablist" aria-label="Command groups">
				{sortedGroups.map((group) => (
					<GroupTab key={group.id} group={group} selected={scope === group.id} onSelect={() => setScope(group.id)} />
				))}
				<span className="pk-cc-groups__divider" aria-hidden="true" />
				<Pill className="pk-cc-group-tab" selected={scope === 'all'} role="tab" aria-selected={scope === 'all'} onClick={() => setScope('all')}>All</Pill>
			</div>

			<div className="pk-cc-projection" key={scope}>
				{projection.destinations.length > 0 ? (
					<div
						className="pk-cc-links"
						role="group"
						aria-label="Destinations"
						style={{ gridTemplateColumns: `repeat(${destinationColumns}, minmax(0, 1fr))` }}
					>
						{projection.destinations.map((item) => (
							<ActionButton key={item.id} item={item} kind="link" active={item.id === activeId} onFocus={() => setActiveId(item.id)} onInvoke={() => void invoke(item)} />
						))}
					</div>
				) : null}
				{projection.grid.length > 0 ? (
					<div className="pk-cc-grid" role="group" aria-label="Commands">
						{projection.grid.map((item) => (
							<ActionButton key={item.id} item={item} kind="grid" active={item.id === activeId} onFocus={() => setActiveId(item.id)} onInvoke={() => void invoke(item)} />
						))}
					</div>
				) : null}
				{projection.overflow.length > 0 ? (
					<div className="pk-cc-overflow" role="group" aria-label="More commands">
						{projection.overflow.map((item) => (
							<ActionButton key={item.id} item={item} kind="overflow" active={item.id === activeId} onFocus={() => setActiveId(item.id)} onInvoke={() => void invoke(item)} />
						))}
					</div>
				) : null}
				{items.length === 0 ? (
					<div className="pk-cc-empty">
						<span>{query ? 'No configured actions match this search.' : 'This group is empty.'}</span>
						<Button variant="secondary" size="sm" onClick={onCustomize}>Customize</Button>
					</div>
				) : null}
			</div>

			<div className="pk-cc-footer">
				<span className="pk-cc-footer__hint"><kbd>↑↓←→</kbd> move <kbd>↵</kbd> open <kbd>esc</kbd> close</span>
				<span className="pk-cc-footer__scope">{query ? `${items.length} in ${scope === 'all' ? 'All' : sortedGroups.find((group) => group.id === scope)?.label}` : ''}</span>
				<Button variant="ghost" size="sm" className="pk-cc-footer__action" onClick={onCustomize}>
					<SlidersHorizontal size={14} />
					<span>Customize</span>
				</Button>
			</div>
		</div>
	);
}
