import React, { useEffect, useMemo, useRef, useState } from 'react';
import {
	ArrowLeft,
	ChevronDown,
	ChevronRight,
	ListOrdered,
	Plus,
	Search,
	Settings2,
	Trash2,
	X,
} from 'lucide-react';
import {
	COMMAND_CENTER_CATALOG_DEFAULTS,
	cloneCommandCenterConfig,
	commandCenterActionKey,
	type CommandCenterActionItem,
	type CommandCenterBoardConfig,
	type CommandCenterCatalogEntry,
	type CommandCenterCatalogScope,
	type CommandCenterGroup,
	type CommandCenterRuntimePort,
} from '@/core/command-center';
import {
	Button,
	IconButton,
	Pill,
	Popover,
	PopoverContent,
	PopoverItem,
	PopoverTrigger,
	Toggle,
} from '@/ui/components/primitives';
import { CommandCenterIcon } from './CommandCenterIcon';
import { IconBrowser } from './IconBrowser';
import {
	CommandCenterArrangeItems,
	CommandCenterArrangeTabs,
	CommandCenterHomeSettings,
	CommandCenterItemEditor,
} from './CommandCenterCustomizePanels';

export interface CommandCenterCustomizeProps {
	runtime: CommandCenterRuntimePort;
	onBack: () => void;
	onClose: () => void;
}

type CustomizePanel = 'catalog' | 'arrange-items' | 'arrange-tabs' | 'home-settings';

const CATALOG_SCOPES: ReadonlyArray<{ value: CommandCenterCatalogScope; label: string }> = [
	{ value: 'commands', label: 'Commands' },
	{ value: 'documents', label: 'Documents' },
	{ value: 'bookmarks', label: 'Bookmarks' },
	{ value: 'workspaces-views', label: 'Workspaces & views' },
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

export function CommandCenterCustomize({ runtime, onBack, onClose }: CommandCenterCustomizeProps): React.ReactElement {
	const [config, setConfig] = useState(() => runtime.getConfig());
	const groups = useMemo(() => config.groups.slice().sort((a, b) => a.order - b.order), [config.groups]);
	const [groupId, setGroupId] = useState(() => groups[0]?.id ?? '');
	const [panel, setPanel] = useState<CustomizePanel>('catalog');
	const [query, setQuery] = useState('');
	const [debouncedQuery, setDebouncedQuery] = useState('');
	const [catalogScope, setCatalogScope] = useState<CommandCenterCatalogScope>('commands');
	const [scopeMenuOpen, setScopeMenuOpen] = useState(false);
	const [modalPortal, setModalPortal] = useState<HTMLDivElement | null>(null);
	const [catalog, setCatalog] = useState<CommandCenterCatalogEntry[]>([]);
	const [catalogLoading, setCatalogLoading] = useState(false);
	const [expandedKey, setExpandedKey] = useState<string | null>(null);
	const [groupIconOpen, setGroupIconOpen] = useState(false);
	const [deleteConfirmGroupId, setDeleteConfirmGroupId] = useState<string | null>(null);
	const [groupLabelDraft, setGroupLabelDraft] = useState('');
	const searchRef = useRef<HTMLInputElement>(null);
	const activeGroup = groups.find((group) => group.id === groupId) ?? groups[0];

	useEffect(() => runtime.subscribe(() => setConfig(runtime.getConfig())), [runtime]);
	useEffect(() => {
		if (!activeGroup && groups[0]) setGroupId(groups[0].id);
	}, [activeGroup, groups]);
	useEffect(() => {
		setGroupLabelDraft(activeGroup?.label ?? '');
		setGroupIconOpen(false);
	}, [activeGroup?.id]);
	useEffect(() => {
		const timer = window.setTimeout(() => setDebouncedQuery(query), COMMAND_CENTER_CATALOG_DEFAULTS.searchDebounceMs);
		return () => window.clearTimeout(timer);
	}, [query]);
	useEffect(() => {
		if (panel !== 'catalog') return;
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
	}, [runtime, debouncedQuery, catalogScope, panel]);
	useEffect(() => {
		if (panel !== 'catalog') return;
		window.requestAnimationFrame(() => searchRef.current?.focus());
	}, [panel]);

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

	const updateItem = (key: string, mutate: (item: CommandCenterActionItem, config: CommandCenterBoardConfig) => void): void => {
		updateGroup((group, next) => {
			const item = findItem(group, key);
			if (item) mutate(item, next);
		});
	};

	const toggleMembership = (entry: CommandCenterCatalogEntry): void => {
		updateGroup((group, next) => {
			const existing = findItem(group, entry.key);
			if (existing) {
				group.actions = group.actions.filter((item) => item.id !== existing.id).map((item, order) => ({ ...item, order }));
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

	const reorderActions = (fromId: string, toId: string): void => {
		if (fromId === toId) return;
		updateGroup((group) => {
			const ordered = group.actions.slice().sort((a, b) => a.order - b.order);
			const from = ordered.findIndex((item) => item.id === fromId);
			const to = ordered.findIndex((item) => item.id === toId);
			if (from < 0 || to < 0) return;
			const [moved] = ordered.splice(from, 1);
			ordered.splice(to, 0, moved!);
			group.actions = ordered.map((item, order) => ({ ...item, order }));
		});
	};

	const reorderTabs = (fromId: string | 'all', toId: string | 'all'): void => {
		if (fromId === toId) return;
		updateConfig((next) => {
			const tabs = next.modal.tabOrder.slice();
			const from = tabs.indexOf(fromId);
			const to = tabs.indexOf(toId);
			if (from < 0 || to < 0) return;
			const [moved] = tabs.splice(from, 1);
			tabs.splice(to, 0, moved!);
			next.modal.tabOrder = tabs;
			const groupOrder = tabs.filter((tab) => tab !== 'all');
			const orderById = new Map(groupOrder.map((id, order) => [id, order]));
			next.groups = next.groups
				.slice()
				.sort((a, b) => (orderById.get(a.id) ?? Number.MAX_SAFE_INTEGER) - (orderById.get(b.id) ?? Number.MAX_SAFE_INTEGER))
				.map((group, order) => ({ ...group, order }));
		});
	};

	const createGroup = (): void => {
		const id = newId('group');
		updateConfig((next) => {
			next.groups.push({ id, label: 'New group', actionLayout: 'layered', order: next.groups.length, actions: [] });
			next.modal.tabOrder.push(id);
		});
		setGroupId(id);
		setPanel('catalog');
		setExpandedKey(null);
	};

	const commitGroupLabel = (): void => {
		if (!activeGroup) return;
		const label = groupLabelDraft.trim();
		if (!label) {
			setGroupLabelDraft(activeGroup.label);
			return;
		}
		setGroupLabelDraft(label);
		if (label !== activeGroup.label) updateGroup((group) => { group.label = label; });
	};

	const changeCatalogScope = (scope: CommandCenterCatalogScope): void => {
		setCatalogScope(scope);
		setCatalog([]);
		setCatalogLoading(true);
		setExpandedKey(null);
		setGroupIconOpen(false);
		window.requestAnimationFrame(() => {
			searchRef.current?.focus();
			searchRef.current?.select();
		});
	};

	const handleKeyDown = (event: React.KeyboardEvent): void => {
		const commandKey = event.metaKey || event.ctrlKey;
		if ((commandKey && event.key.toLocaleLowerCase() === 'f') || (event.key === '/' && event.target !== searchRef.current)) {
			event.preventDefault();
			event.stopPropagation();
			setPanel('catalog');
			window.requestAnimationFrame(() => searchRef.current?.focus());
		}
	};

	if (!activeGroup) {
		return (
			<div className="pk-cc-customize" onKeyDown={handleKeyDown}>
				<div className="pk-cc-customize__head"><span className="pk-cc-customize__title">Customize Command Center</span><Button variant="secondary" size="sm" onClick={createGroup}>New group</Button></div>
			</div>
		);
	}

	const panelTitle = panel === 'arrange-items'
		? `Arrange ${activeGroup.label}`
		: panel === 'arrange-tabs'
			? 'Launcher tabs'
			: panel === 'home-settings'
				? 'Command Center Home'
				: 'Customize Command Center';
	const scopeLabel = CATALOG_SCOPES.find((scope) => scope.value === catalogScope)?.label ?? 'Commands';
	const emptyMessage = catalogScope === 'documents' && !debouncedQuery.trim()
		? 'Recent documents will appear here when they are available.'
		: `No ${scopeLabel.toLocaleLowerCase()} match.`;

	return (
		<div className="pk-cc-customize" onKeyDown={handleKeyDown}>
			<div ref={setModalPortal} className="pk-cc-local-portal" />
			<div className="pk-cc-customize__head">
				<IconButton className="pk-cc-icon-button pk-cc-customize__back" label={panel === 'catalog' ? 'Back to Command Center' : 'Back to customization'} onClick={() => panel === 'catalog' ? onBack() : setPanel('catalog')}><ArrowLeft size={16} /></IconButton>
				<span className="pk-cc-customize__title">{panelTitle}</span>
				<IconButton className="pk-cc-icon-button pk-cc-customize__close" label="Close Command Center" onClick={onClose}><X size={16} /></IconButton>
			</div>

			{panel === 'catalog' ? <div className="pk-cc-manage-groups">
				<div className="pk-cc-manage-groups__track" role="tablist" aria-label="Groups">
					{groups.map((group) => (
						<Pill key={group.id} className="pk-cc-manage-group" selected={group.id === activeGroup.id} role="tab" aria-selected={group.id === activeGroup.id} onClick={() => {
							setGroupId(group.id);
							setPanel('catalog');
							setExpandedKey(null);
							setDeleteConfirmGroupId(null);
						}}>
							<CommandCenterIcon icon={group.icon} size={14} /><span>{group.label}</span>
						</Pill>
					))}
				</div>
				<span className="pk-cc-manage-groups__actions">
					<IconButton className="pk-cc-icon-button" label="Arrange launcher tabs" title="Arrange launcher tabs" onClick={() => setPanel('arrange-tabs')}><ListOrdered size={15} /></IconButton>
					<IconButton className="pk-cc-icon-button" label="Command Center Home settings" title="Command Center Home settings" onClick={() => setPanel('home-settings')}><Settings2 size={15} /></IconButton>
					<IconButton className="pk-cc-icon-button" label="New group" title="New group" onClick={createGroup}><Plus size={16} /></IconButton>
				</span>
			</div> : null}

			{panel === 'catalog' ? (
				<>
					<div className="pk-cc-group-identity">
						<IconButton className="pk-cc-group-icon" label="Choose group icon" onClick={() => setGroupIconOpen((open) => !open)}>
							{activeGroup.icon ? <CommandCenterIcon icon={activeGroup.icon} size={17} /> : <Plus size={15} />}
						</IconButton>
						<input value={groupLabelDraft} aria-label="Group name" onChange={(event) => setGroupLabelDraft(event.target.value)} onBlur={commitGroupLabel} onKeyDown={(event) => {
							if (event.key === 'Enter') event.currentTarget.blur();
							if (event.key === 'Escape') {
								event.preventDefault();
								setGroupLabelDraft(activeGroup.label);
							}
						}} />
						<span>{activeGroup.actions.length} items</span>
						<Button variant="ghost" size="sm" className="pk-cc-arrange-trigger" onClick={() => setPanel('arrange-items')}><ListOrdered size={14} /><span>Arrange</span></Button>
						{groups.length > 1 ? (
							<Button variant="ghost" size="sm" className={`pk-cc-delete-group${deleteConfirmGroupId === activeGroup.id ? ' pk-cc-delete-confirm' : ''}`} aria-label="Delete group" onClick={() => {
								if (deleteConfirmGroupId !== activeGroup.id) {
									setDeleteConfirmGroupId(activeGroup.id);
									return;
								}
								const nextId = groups.find((group) => group.id !== activeGroup.id)?.id ?? '';
								updateConfig((next) => {
									next.groups = next.groups.filter((group) => group.id !== activeGroup.id).map((group, order) => ({ ...group, order }));
									next.modal.tabOrder = next.modal.tabOrder.filter((tab) => tab !== activeGroup.id);
								});
								setGroupId(nextId);
								setDeleteConfirmGroupId(null);
							}}>
								<Trash2 size={14} />{deleteConfirmGroupId === activeGroup.id ? <span>Delete?</span> : null}
							</Button>
						) : null}
					</div>
					{groupIconOpen ? <IconBrowser value={activeGroup.icon} onChange={(icon) => updateGroup((group) => { group.icon = icon; })} onClose={() => setGroupIconOpen(false)} /> : null}
				</>
			) : null}

			{panel === 'arrange-items' ? <CommandCenterArrangeItems group={activeGroup} onReorder={reorderActions} /> : null}
			{panel === 'arrange-tabs' ? <CommandCenterArrangeTabs config={config} onReorder={reorderTabs} /> : null}
			{panel === 'home-settings' ? <CommandCenterHomeSettings config={config} onChange={updateConfig} /> : null}

			{panel === 'catalog' ? (
				<>
					<div className="pk-cc-catalog-tools">
						<Popover open={scopeMenuOpen} onOpenChange={setScopeMenuOpen}>
							<PopoverTrigger asChild>
								<Button variant="ghost" size="sm" className="pk-cc-scope-trigger"><span>{scopeLabel}</span><ChevronDown size={13} /></Button>
							</PopoverTrigger>
							<PopoverContent className="pk-cc-scope-menu" align="start" container={modalPortal} onCloseAutoFocus={(event) => {
								event.preventDefault();
								searchRef.current?.focus();
								searchRef.current?.select();
							}}>
								{CATALOG_SCOPES.map((scope) => <PopoverItem key={scope.value} data-selected={catalogScope === scope.value ? 'true' : undefined} onClick={() => {
									changeCatalogScope(scope.value);
									setScopeMenuOpen(false);
								}}>{scope.label}</PopoverItem>)}
							</PopoverContent>
						</Popover>
						<label className="pk-cc-directory-search">
							<Search size={15} aria-hidden="true" />
							<input ref={searchRef} value={query} onChange={(event) => setQuery(event.target.value)} placeholder={SEARCH_PLACEHOLDERS[catalogScope]} autoFocus />
						</label>
					</div>

					<div className="pk-cc-directory" role="list" aria-label={`Items for ${activeGroup.label}`} aria-busy={catalogLoading}>
						{catalog.map((entry) => {
							const item = findItem(activeGroup, entry.key);
							const expanded = Boolean(item && expandedKey === entry.key);
							return (
								<div key={entry.key} className="pk-cc-directory-entry" data-active={item ? 'true' : 'false'} role="listitem">
									<div className="pk-cc-directory-row">
										<span className="pk-cc-directory-row__icon"><CommandCenterIcon icon={item?.icon ?? entry.icon} size={16} /></span>
										<Button variant="ghost" size="sm" className="pk-cc-directory-row__main" disabled={!item} onClick={() => item && setExpandedKey(expanded ? null : entry.key)}>
											<span className="pk-cc-directory-row__copy"><span className="pk-cc-directory-row__label">{item?.shortLabel ?? entry.label}</span><span className="pk-cc-directory-row__source">{entry.sourceLabel}</span></span>
										</Button>
										{entry.hotkey ? <kbd>{entry.hotkey}</kbd> : null}
										{item ? (expanded ? <ChevronDown size={14} /> : <ChevronRight size={14} />) : null}
										<Toggle checked={Boolean(item)} label={`${item ? 'Remove' : 'Add'} ${entry.label} ${item ? 'from' : 'to'} ${activeGroup.label}`} onCheckedChange={() => toggleMembership(entry)} />
									</div>
									{expanded && item ? (
										<CommandCenterItemEditor
											item={item}
											onUpdate={(mutate) => updateItem(entry.key, mutate)}
											onPin={(checked) => updateItem(entry.key, (target, next) => {
												target.pinnedToHome = checked;
												next.home.quickAccessActionIds = checked ? Array.from(new Set([...next.home.quickAccessActionIds, target.id])) : next.home.quickAccessActionIds.filter((id) => id !== target.id);
											})}
										/>
									) : null}
								</div>
							);
						})}
						{catalogLoading ? <div className="pk-cc-directory__empty">Searching…</div> : null}
						{!catalogLoading && catalog.length === 0 ? <div className="pk-cc-directory__empty">{emptyMessage}</div> : null}
					</div>
				</>
			) : null}
		</div>
	);
}
