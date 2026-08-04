import React, { useEffect, useMemo, useState } from 'react';
import {
	ArrowLeft,
	ChevronDown,
	ChevronRight,
	GripVertical,
	Plus,
	Search,
	Settings2,
	Trash2,
} from 'lucide-react';
import {
	COMMAND_CENTER_CATALOG_DEFAULTS,
	cloneCommandCenterConfig,
	commandCenterActionKey,
	type CommandCenterActionItem,
	type CommandCenterBoardConfig,
	type CommandCenterCatalogEntry,
	type CommandCenterCatalogScope,
	type CommandCenterDisplayMode,
	type CommandCenterGroup,
	type CommandCenterItemIcon,
	type CommandCenterRuntimePort,
} from '@/core/command-center';
import { Button, IconButton, Pill, Segmented, Toggle } from '@/ui/components/primitives';
import { CommandCenterIcon } from './CommandCenterIcon';
import { IconBrowser } from './IconBrowser';

export interface CommandCenterCustomizeProps {
	runtime: CommandCenterRuntimePort;
	onBack: () => void;
	onDone: () => void;
}

const CATALOG_SCOPES: ReadonlyArray<{ value: CommandCenterCatalogScope; label: string }> = [
	{ value: 'commands', label: 'Commands' },
	{ value: 'documents', label: 'Documents' },
	{ value: 'bookmarks', label: 'Bookmarks' },
	{ value: 'workspaces-views', label: 'Workspaces & views' },
];

const DISPLAY_OPTIONS: ReadonlyArray<{ value: CommandCenterDisplayMode; label: string }> = [
	{ value: 'icon-label', label: 'Icon + label' },
	{ value: 'icon-only', label: 'Icon only' },
	{ value: 'text-only', label: 'Text only' },
];

const SEARCH_PLACEHOLDERS: Record<CommandCenterCatalogScope, string> = {
	commands: 'Find a command',
	documents: 'Find a document',
	bookmarks: 'Find a bookmark',
	'workspaces-views': 'Find a workspace or view',
};

function compactCommandLabel(label: string): string {
	const pieces = label.split(':').map((piece) => piece.trim()).filter(Boolean);
	return pieces.length > 1 ? pieces[pieces.length - 1]! : label;
}

function newId(prefix: string): string {
	return `${prefix}-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 7)}`;
}

function findItem(group: CommandCenterGroup, key: string): CommandCenterActionItem | undefined {
	return group.actions.find((item) => commandCenterActionKey(item.action) === key);
}

export function CommandCenterCustomize({ runtime, onBack, onDone }: CommandCenterCustomizeProps): React.ReactElement {
	const [config, setConfig] = useState(() => runtime.getConfig());
	const groups = useMemo(() => config.groups.slice().sort((a, b) => a.order - b.order), [config.groups]);
	const [groupId, setGroupId] = useState(() => groups[0]?.id ?? '');
	const [query, setQuery] = useState('');
	const [debouncedQuery, setDebouncedQuery] = useState('');
	const [catalogScope, setCatalogScope] = useState<CommandCenterCatalogScope>('commands');
	const [catalog, setCatalog] = useState<CommandCenterCatalogEntry[]>([]);
	const [catalogLoading, setCatalogLoading] = useState(false);
	const [expandedKey, setExpandedKey] = useState<string | null>(null);
	const [iconTarget, setIconTarget] = useState<'group' | string | null>(null);
	const [draggedGroupId, setDraggedGroupId] = useState<string | null>(null);
	const [draggedItemKey, setDraggedItemKey] = useState<string | null>(null);
	const [deleteConfirmGroupId, setDeleteConfirmGroupId] = useState<string | null>(null);
	const [homeOptionsOpen, setHomeOptionsOpen] = useState(false);
	const activeGroup = groups.find((group) => group.id === groupId) ?? groups[0];

	useEffect(() => runtime.subscribe(() => setConfig(runtime.getConfig())), [runtime]);
	useEffect(() => {
		if (!activeGroup && groups[0]) setGroupId(groups[0].id);
	}, [activeGroup, groups]);
	useEffect(() => {
		const timer = window.setTimeout(
			() => setDebouncedQuery(query),
			COMMAND_CENTER_CATALOG_DEFAULTS.searchDebounceMs,
		);
		return () => window.clearTimeout(timer);
	}, [query]);
	useEffect(() => {
		let cancelled = false;
		setCatalogLoading(true);
		void runtime.getCatalog(debouncedQuery, catalogScope)
			.then((entries) => {
				if (cancelled) return;
				setCatalog(entries);
				setCatalogLoading(false);
			})
			.catch((error) => {
				if (cancelled) return;
				console.error('[Peak Command Center] Failed to load customization catalog.', error);
				setCatalog([]);
				setCatalogLoading(false);
			});
		return () => { cancelled = true; };
	}, [runtime, debouncedQuery, catalogScope]);

	const updateConfig = (mutate: (next: CommandCenterBoardConfig) => void): void => {
		const next = cloneCommandCenterConfig(runtime.getConfig());
		mutate(next);
		setConfig(next);
		void runtime.saveConfig(next).catch((error) => {
			console.error('[Peak Command Center] Failed to save customization.', error);
		});
	};

	const updateGroup = (mutate: (group: CommandCenterGroup, config: CommandCenterBoardConfig) => void): void => {
		if (!activeGroup) return;
		updateConfig((next) => {
			const group = next.groups.find((candidate) => candidate.id === activeGroup.id);
			if (group) mutate(group, next);
		});
	};

	const toggleMembership = (entry: CommandCenterCatalogEntry): void => {
		const key = entry.key;
		updateGroup((group, next) => {
			const existing = findItem(group, key);
			if (existing) {
				group.actions = group.actions
					.filter((item) => item.id !== existing.id)
					.map((item, order) => ({ ...item, order }));
				next.home.quickAccessActionIds = next.home.quickAccessActionIds.filter((id) => id !== existing.id);
				setExpandedKey(null);
				return;
			}
			group.actions.push({
				id: newId('action'),
				action: entry.action,
				shortLabel: compactCommandLabel(entry.label),
				aliases: [],
				icon: entry.icon,
				display: entry.icon ? 'icon-label' : 'text-only',
				pinnedToHome: false,
				order: group.actions.length,
			});
		});
	};

	const updateItem = (
		key: string,
		mutate: (item: CommandCenterActionItem, config: CommandCenterBoardConfig) => void,
	): void => {
		updateGroup((group, next) => {
			const item = findItem(group, key);
			if (item) mutate(item, next);
		});
	};

	const setItemIcon = (key: string, icon: CommandCenterItemIcon | undefined): void => {
		updateItem(key, (item) => {
			item.icon = icon;
			if (!icon && item.display === 'icon-only') item.display = 'text-only';
		});
	};

	const reorderItems = (targetKey: string): void => {
		if (!draggedItemKey || draggedItemKey === targetKey) return;
		updateGroup((group) => {
			const from = group.actions.findIndex((item) => commandCenterActionKey(item.action) === draggedItemKey);
			const to = group.actions.findIndex((item) => commandCenterActionKey(item.action) === targetKey);
			if (from < 0 || to < 0) return;
			const [moved] = group.actions.splice(from, 1);
			group.actions.splice(to, 0, moved!);
			group.actions = group.actions.map((item, order) => ({ ...item, order }));
		});
		setDraggedItemKey(null);
	};

	const reorderGroups = (targetId: string): void => {
		if (!draggedGroupId || draggedGroupId === targetId) return;
		updateConfig((next) => {
			const ordered = next.groups.slice().sort((a, b) => a.order - b.order);
			const from = ordered.findIndex((group) => group.id === draggedGroupId);
			const to = ordered.findIndex((group) => group.id === targetId);
			if (from < 0 || to < 0) return;
			const [moved] = ordered.splice(from, 1);
			ordered.splice(to, 0, moved!);
			next.groups = ordered.map((group, order) => ({ ...group, order }));
		});
		setDraggedGroupId(null);
	};

	const createGroup = (): void => {
		const id = newId('group');
		updateConfig((next) => {
			next.groups.push({ id, label: 'New group', actionLayout: 'layered', order: next.groups.length, actions: [] });
		});
		setGroupId(id);
		setExpandedKey(null);
	};

	const changeCatalogScope = (scope: CommandCenterCatalogScope): void => {
		setCatalogScope(scope);
		setCatalog([]);
		setCatalogLoading(true);
		setExpandedKey(null);
		setIconTarget(null);
	};

	if (!activeGroup) {
		return (
			<div className="pk-cc-customize">
				<div className="pk-cc-customize__head">
					<span>Customize</span>
					<Button variant="secondary" size="sm" onClick={createGroup}>New group</Button>
				</div>
			</div>
		);
	}

	const documentQueryTooShort = catalogScope === 'documents'
		&& debouncedQuery.trim().length < COMMAND_CENTER_CATALOG_DEFAULTS.minimumDocumentQueryLength;
	const emptyMessage = documentQueryTooShort
		? 'Type at least two characters to search documents.'
		: `No ${CATALOG_SCOPES.find((scope) => scope.value === catalogScope)?.label.toLocaleLowerCase()} match.`;

	return (
		<div className="pk-cc-customize">
			<div className="pk-cc-customize__head">
				<Button variant="ghost" size="sm" className="pk-cc-customize__back" onClick={onBack}>
					<ArrowLeft size={15} /><span>Back</span>
				</Button>
				<span className="pk-cc-customize__title">Customize</span>
				<Button variant="ghost" size="sm" className="pk-cc-customize__done" onClick={onDone}>Done</Button>
			</div>

			<div className="pk-cc-manage-groups" role="tablist" aria-label="Groups">
				{groups.map((group) => (
					<Pill
						key={group.id}
						className="pk-cc-manage-group"
						selected={group.id === activeGroup.id}
						role="tab"
						aria-selected={group.id === activeGroup.id}
						draggable
						onDragStart={() => setDraggedGroupId(group.id)}
						onDragOver={(event) => event.preventDefault()}
						onDrop={() => reorderGroups(group.id)}
						onClick={() => {
							setGroupId(group.id);
							setExpandedKey(null);
							setIconTarget(null);
							setDeleteConfirmGroupId(null);
						}}
					>
						<CommandCenterIcon icon={group.icon} size={14} />
						<span>{group.label}</span>
					</Pill>
				))}
				<Pill className="pk-cc-manage-group pk-cc-manage-group--new" onClick={createGroup}>
					<Plus size={14} /><span>New group</span>
				</Pill>
			</div>

			<div className="pk-cc-group-identity">
				<IconButton
					className="pk-cc-group-icon"
					label="Choose group icon"
					onClick={() => setIconTarget(iconTarget === 'group' ? null : 'group')}
				>
					{activeGroup.icon ? <CommandCenterIcon icon={activeGroup.icon} size={17} /> : <Plus size={15} />}
				</IconButton>
				<input
					value={activeGroup.label}
					aria-label="Group name"
					onChange={(event) => updateGroup((group) => { group.label = event.target.value; })}
				/>
				<span>{activeGroup.actions.length} items</span>
				{groups.length > 1 ? (
					<Button
						variant="ghost"
						size="sm"
						className={`pk-cc-delete-group${deleteConfirmGroupId === activeGroup.id ? ' pk-cc-delete-confirm' : ''}`}
						aria-label="Delete group"
						onClick={() => {
							if (deleteConfirmGroupId !== activeGroup.id) {
								setDeleteConfirmGroupId(activeGroup.id);
								return;
							}
							const nextId = groups.find((group) => group.id !== activeGroup.id)?.id ?? '';
							updateConfig((next) => {
								next.groups = next.groups
									.filter((group) => group.id !== activeGroup.id)
									.map((group, order) => ({ ...group, order }));
							});
							setGroupId(nextId);
							setDeleteConfirmGroupId(null);
						}}
					>
						<Trash2 size={14} />
						{deleteConfirmGroupId === activeGroup.id ? <span>Delete?</span> : null}
					</Button>
				) : null}
			</div>
			{iconTarget === 'group' ? (
				<IconBrowser
					value={activeGroup.icon}
					onChange={(icon) => updateGroup((group) => { group.icon = icon; })}
					onClose={() => setIconTarget(null)}
				/>
			) : null}

			<div className="pk-cc-home-settings">
				<Button
					variant="ghost"
					size="sm"
					className="pk-cc-home-settings__trigger"
					aria-expanded={homeOptionsOpen}
					onClick={() => setHomeOptionsOpen((open) => !open)}
				>
					<Settings2 size={14} /><span>Home behavior</span>
					{homeOptionsOpen ? <ChevronDown size={13} /> : <ChevronRight size={13} />}
				</Button>
				{homeOptionsOpen ? (
					<div className="pk-cc-home-options" aria-label="Home behavior">
						<div>
							<span>Open on startup</span>
							<Toggle
								checked={config.home.openOnStartup}
								label="Open Home on startup"
								onCheckedChange={(checked) => updateConfig((next) => { next.home.openOnStartup = checked; })}
							/>
						</div>
						<div>
							<span>Use for empty tabs</span>
							<Toggle
								checked={config.home.replaceEmptyTab}
								label="Use Home for empty tabs"
								onCheckedChange={(checked) => updateConfig((next) => { next.home.replaceEmptyTab = checked; })}
							/>
						</div>
					</div>
				) : null}
			</div>

			<div className="pk-cc-catalog-tools">
				<label className="pk-cc-directory-search">
					<Search size={15} aria-hidden="true" />
					<input
						value={query}
						onChange={(event) => setQuery(event.target.value)}
						placeholder={SEARCH_PLACEHOLDERS[catalogScope]}
					/>
				</label>
				<div className="pk-cc-catalog-scopes" role="tablist" aria-label="Catalog type">
					{CATALOG_SCOPES.map((scope) => (
						<Pill
							key={scope.value}
							selected={catalogScope === scope.value}
							role="tab"
							aria-selected={catalogScope === scope.value}
							onClick={() => changeCatalogScope(scope.value)}
						>
							{scope.label}
						</Pill>
					))}
				</div>
			</div>

			<div className="pk-cc-directory" role="list" aria-label={`Items for ${activeGroup.label}`} aria-busy={catalogLoading}>
				{catalog.map((entry) => {
					const item = findItem(activeGroup, entry.key);
					const expanded = Boolean(item && expandedKey === entry.key);
					const displayOptions = DISPLAY_OPTIONS.filter((option) => option.value !== 'icon-only' || item?.icon);
					return (
						<div
							key={entry.key}
							className="pk-cc-directory-entry"
							data-active={item ? 'true' : 'false'}
							draggable={Boolean(item)}
							onDragStart={() => item && setDraggedItemKey(entry.key)}
							onDragOver={(event) => { if (item) event.preventDefault(); }}
							onDrop={() => item && reorderItems(entry.key)}
							role="listitem"
						>
							<div className="pk-cc-directory-row">
								<span className="pk-cc-directory-row__drag" aria-hidden="true">
									{item ? <GripVertical size={14} /> : null}
								</span>
								<span className="pk-cc-directory-row__icon">
									<CommandCenterIcon icon={item?.icon ?? entry.icon} size={16} />
								</span>
								<Button
									variant="ghost"
									size="sm"
									className="pk-cc-directory-row__main"
									disabled={!item}
									onClick={() => item && setExpandedKey(expanded ? null : entry.key)}
								>
									<span className="pk-cc-directory-row__copy">
										<span className="pk-cc-directory-row__label">{item?.shortLabel ?? entry.label}</span>
										<span className="pk-cc-directory-row__source">{entry.sourceLabel}</span>
									</span>
								</Button>
								{entry.hotkey ? <kbd>{entry.hotkey}</kbd> : null}
								{item ? (expanded ? <ChevronDown size={14} /> : <ChevronRight size={14} />) : null}
								<Toggle
									checked={Boolean(item)}
									label={`${item ? 'Remove' : 'Add'} ${entry.label} ${item ? 'from' : 'to'} ${activeGroup.label}`}
									onCheckedChange={() => toggleMembership(entry)}
								/>
							</div>
							{expanded && item ? (
								<div className="pk-cc-item-editor">
									<label>
										<span>Name</span>
										<input
											value={item.shortLabel}
											onChange={(event) => updateItem(entry.key, (target) => { target.shortLabel = event.target.value; })}
										/>
									</label>
									<label>
										<span>Aliases</span>
										<input
											value={item.aliases.join(', ')}
											placeholder="Separate with commas"
											onChange={(event) => updateItem(entry.key, (target) => {
												target.aliases = event.target.value.split(',').map((alias) => alias.trim()).filter(Boolean);
											})}
										/>
									</label>
									<div className="pk-cc-item-editor__row">
										<span>Display</span>
										<Segmented
											value={item.display}
											onValueChange={(mode) => updateItem(entry.key, (target) => { target.display = mode; })}
											options={displayOptions}
											size="sm"
											aria-label="Display mode"
										/>
									</div>
									<div className="pk-cc-item-editor__row">
										<span>Icon</span>
										<Button
											variant="secondary"
											size="sm"
											className="pk-cc-icon-picker-trigger"
											onClick={() => setIconTarget(iconTarget === entry.key ? null : entry.key)}
										>
											<CommandCenterIcon icon={item.icon} size={15} />
											<span>{item.icon?.kind === 'lucide' ? item.icon.name : item.icon?.value ?? 'Choose icon'}</span>
										</Button>
									</div>
									<div className="pk-cc-item-editor__row">
										<span>Pin to Home</span>
										<Toggle
											checked={item.pinnedToHome}
											label={`Pin ${item.shortLabel} to Home`}
											onCheckedChange={(checked) => updateItem(entry.key, (target, next) => {
												target.pinnedToHome = checked;
												next.home.quickAccessActionIds = checked
													? Array.from(new Set([...next.home.quickAccessActionIds, target.id]))
													: next.home.quickAccessActionIds.filter((id) => id !== target.id);
											})}
										/>
									</div>
									{iconTarget === entry.key ? (
										<IconBrowser
											value={item.icon}
											onChange={(icon) => setItemIcon(entry.key, icon)}
											onClose={() => setIconTarget(null)}
										/>
									) : null}
								</div>
							) : null}
						</div>
					);
				})}
				{catalogLoading ? <div className="pk-cc-directory__empty">Searching…</div> : null}
				{!catalogLoading && catalog.length === 0 ? <div className="pk-cc-directory__empty">{emptyMessage}</div> : null}
			</div>
		</div>
	);
}
