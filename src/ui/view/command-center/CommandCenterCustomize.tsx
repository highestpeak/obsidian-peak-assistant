import React, { useEffect, useMemo, useState } from 'react';
import { ArrowLeft, Check, ChevronDown, ChevronRight, GripVertical, Plus, Search, Trash2 } from 'lucide-react';
import {
	cloneCommandCenterConfig,
	commandCenterActionKey,
	type CommandCenterActionItem,
	type CommandCenterBoardConfig,
	type CommandCenterCatalogEntry,
	type CommandCenterDisplayMode,
	type CommandCenterGroup,
	type CommandCenterItemIcon,
	type CommandCenterRuntimePort,
} from '@/core/command-center';
import { Button } from '@/ui/component/shared-ui/button';
import { Switch } from '@/ui/component/shared-ui/switch';
import { CommandCenterIcon } from './CommandCenterIcon';
import { IconBrowser } from './IconBrowser';

export interface CommandCenterCustomizeProps {
	runtime: CommandCenterRuntimePort;
	onBack: () => void;
	onDone: () => void;
}

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
	const [catalog, setCatalog] = useState<CommandCenterCatalogEntry[]>([]);
	const [expandedKey, setExpandedKey] = useState<string | null>(null);
	const [iconTarget, setIconTarget] = useState<'group' | string | null>(null);
	const [draggedGroupId, setDraggedGroupId] = useState<string | null>(null);
	const [draggedItemKey, setDraggedItemKey] = useState<string | null>(null);
	const [deleteConfirmGroupId, setDeleteConfirmGroupId] = useState<string | null>(null);
	const activeGroup = groups.find((group) => group.id === groupId) ?? groups[0];

	useEffect(() => runtime.subscribe(() => setConfig(runtime.getConfig())), [runtime]);
	useEffect(() => {
		if (!activeGroup && groups[0]) setGroupId(groups[0].id);
	}, [activeGroup, groups]);
	useEffect(() => {
		let cancelled = false;
		void runtime.getCatalog(query).then((entries) => {
			if (!cancelled) setCatalog(entries);
		});
		return () => { cancelled = true; };
	}, [runtime, query, config]);

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

	const updateItem = (key: string, mutate: (item: CommandCenterActionItem, config: CommandCenterBoardConfig) => void): void => {
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

	if (!activeGroup) {
		return (
			<div className="pk-cc-customize">
				<div className="pk-cc-customize__head"><span>Customize</span><Button variant="unstyled" size="xs" onClick={createGroup}>New group</Button></div>
			</div>
		);
	}

	return (
		<div className="pk-cc-customize">
			<div className="pk-cc-customize__head">
				<Button variant="unstyled" size="xs" className="pk-cc-customize__back" onClick={onBack}><ArrowLeft size={15} /><span>Back</span></Button>
				<span className="pk-cc-customize__title">Customize</span>
				<Button variant="unstyled" size="xs" className="pk-cc-customize__done" onClick={onDone}>Done</Button>
			</div>

			<div className="pk-cc-manage-groups" role="tablist" aria-label="Groups">
				{groups.map((group) => (
					<Button
						key={group.id}
						variant="unstyled"
						size="xs"
						className="pk-cc-manage-group"
						role="tab"
						aria-selected={group.id === activeGroup.id}
						draggable
						onDragStart={() => setDraggedGroupId(group.id)}
						onDragOver={(event) => event.preventDefault()}
						onDrop={() => reorderGroups(group.id)}
						onClick={() => { setGroupId(group.id); setExpandedKey(null); setIconTarget(null); setDeleteConfirmGroupId(null); }}
					>
						<CommandCenterIcon icon={group.icon} size={14} />
						<span>{group.label}</span>
					</Button>
				))}
				<Button variant="unstyled" size="xs" className="pk-cc-manage-group pk-cc-manage-group--new" onClick={createGroup}><Plus size={14} /><span>New group</span></Button>
			</div>

			<div className="pk-cc-group-identity">
				<Button variant="unstyled" size="xs" className="pk-cc-group-icon" aria-label="Choose group icon" onClick={() => setIconTarget(iconTarget === 'group' ? null : 'group')}>
					{activeGroup.icon ? <CommandCenterIcon icon={activeGroup.icon} size={17} /> : <Plus size={15} />}
				</Button>
				<input
					value={activeGroup.label}
					aria-label="Group name"
					onChange={(event) => updateGroup((group) => { group.label = event.target.value; })}
				/>
				<span>{activeGroup.actions.length} items</span>
				{groups.length > 1 ? (
					<Button
						variant="unstyled"
						size="xs"
						className={`pk-cc-icon-button${deleteConfirmGroupId === activeGroup.id ? ' pk-cc-delete-confirm' : ''}`}
						aria-label="Delete group"
						onClick={() => {
							if (deleteConfirmGroupId !== activeGroup.id) {
								setDeleteConfirmGroupId(activeGroup.id);
								return;
							}
							const nextId = groups.find((group) => group.id !== activeGroup.id)?.id ?? '';
							updateConfig((next) => { next.groups = next.groups.filter((group) => group.id !== activeGroup.id).map((group, order) => ({ ...group, order })); });
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

			<div className="pk-cc-home-options" aria-label="Home behavior">
				<span>Home</span>
				<div><span>Open on startup</span><Switch checked={config.home.openOnStartup} size="sm" label="Open Home on startup" onChange={(checked) => updateConfig((next) => { next.home.openOnStartup = checked; })} /></div>
				<div><span>Use for empty tabs</span><Switch checked={config.home.replaceEmptyTab} size="sm" label="Use Home for empty tabs" onChange={(checked) => updateConfig((next) => { next.home.replaceEmptyTab = checked; })} /></div>
			</div>

			<label className="pk-cc-directory-search">
				<Search size={15} aria-hidden="true" />
				<input value={query} onChange={(event) => setQuery(event.target.value)} placeholder="Find commands, files, bookmarks and workspaces" />
			</label>

			<div className="pk-cc-directory" role="list" aria-label={`Items for ${activeGroup.label}`}>
				{catalog.map((entry) => {
					const item = findItem(activeGroup, entry.key);
					const expanded = Boolean(item && expandedKey === entry.key);
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
								<span className="pk-cc-directory-row__drag" aria-hidden="true">{item ? <GripVertical size={14} /> : null}</span>
								<span className="pk-cc-directory-row__icon"><CommandCenterIcon icon={item?.icon ?? entry.icon} size={16} /></span>
								<Button
									variant="unstyled"
									size="xs"
									className="pk-cc-directory-row__main"
									disabled={!item}
									onClick={() => item && setExpandedKey(expanded ? null : entry.key)}
								>
									<span className="pk-cc-directory-row__label">{item?.shortLabel ?? entry.label}</span>
									<span className="pk-cc-directory-row__source">{entry.sourceLabel}</span>
								</Button>
								{entry.hotkey ? <kbd>{entry.hotkey}</kbd> : null}
								{item ? (expanded ? <ChevronDown size={14} /> : <ChevronRight size={14} />) : null}
								<Switch
									checked={Boolean(item)}
									size="sm"
									label={`${item ? 'Remove' : 'Add'} ${entry.label} ${item ? 'from' : 'to'} ${activeGroup.label}`}
									onChange={() => toggleMembership(entry)}
								/>
							</div>
							{expanded && item ? (
								<div className="pk-cc-item-editor">
									<label><span>Name</span><input value={item.shortLabel} onChange={(event) => updateItem(entry.key, (target) => { target.shortLabel = event.target.value; })} /></label>
									<label><span>Aliases</span><input value={item.aliases.join(', ')} placeholder="Separate with commas" onChange={(event) => updateItem(entry.key, (target) => { target.aliases = event.target.value.split(',').map((alias) => alias.trim()).filter(Boolean); })} /></label>
									<div className="pk-cc-item-editor__row">
										<span>Display</span>
										<div className="pk-cc-segmented" role="radiogroup" aria-label="Display mode">
											{([
												['icon-label', 'Icon + label'],
												['icon-only', 'Icon only'],
												['text-only', 'Text only'],
											] as Array<[CommandCenterDisplayMode, string]>).map(([mode, label]) => (
												<Button key={mode} variant="unstyled" size="xs" role="radio" aria-checked={item.display === mode} disabled={mode === 'icon-only' && !item.icon} onClick={() => updateItem(entry.key, (target) => { target.display = mode; })}>{item.display === mode ? <Check size={12} /> : null}{label}</Button>
											))}
										</div>
									</div>
									<div className="pk-cc-item-editor__row">
										<span>Icon</span>
										<Button variant="unstyled" size="xs" className="pk-cc-icon-picker-trigger" onClick={() => setIconTarget(iconTarget === entry.key ? null : entry.key)}>
											<CommandCenterIcon icon={item.icon} size={15} /><span>{item.icon?.kind === 'lucide' ? item.icon.name : item.icon?.value ?? 'Choose icon'}</span>
										</Button>
									</div>
									<div className="pk-cc-item-editor__row">
										<span>Pin to Home</span>
										<Switch
											checked={item.pinnedToHome}
											size="sm"
											label={`Pin ${item.shortLabel} to Home`}
											onChange={(checked) => updateItem(entry.key, (target, next) => {
												target.pinnedToHome = checked;
												next.home.quickAccessActionIds = checked
													? Array.from(new Set([...next.home.quickAccessActionIds, target.id]))
													: next.home.quickAccessActionIds.filter((id) => id !== target.id);
											})}
										/>
									</div>
									{iconTarget === entry.key ? <IconBrowser value={item.icon} onChange={(icon) => setItemIcon(entry.key, icon)} onClose={() => setIconTarget(null)} /> : null}
								</div>
							) : null}
						</div>
					);
				})}
				{catalog.length === 0 ? <div className="pk-cc-directory__empty">No commands or destinations match.</div> : null}
			</div>
		</div>
	);
}
