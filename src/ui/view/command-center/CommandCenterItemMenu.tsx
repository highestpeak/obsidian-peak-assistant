import React, { useEffect, useRef, useState } from 'react';
import {
	ArrowLeft,
	Check,
	ChevronRight,
	House,
	MoreHorizontal,
	MoveRight,
	Play,
	Plus,
	Settings2,
	Trash2,
} from 'lucide-react';
import {
	getCommandCenterItemMembership,
	type CommandCenterBoardConfig,
	type CommandCenterRuntimePort,
	type CommandCenterTabId,
	type ResolvedCommandCenterItem,
} from '@/core/command-center';
import {
	IconButton,
	Popover,
	PopoverContent,
	PopoverItem,
	PopoverTrigger,
} from '@/ui/components/primitives';
import { useRovingComposite } from '@/ui/keyboard/useRovingComposite';

type ItemMenuPanel = 'main' | 'add' | 'move';

export interface CommandCenterItemMenuProps {
	runtime: CommandCenterRuntimePort;
	config: CommandCenterBoardConfig;
	item: ResolvedCommandCenterItem;
	scope: CommandCenterTabId;
	portalContainer: HTMLElement | null;
	open: boolean;
	onOpenChange: (open: boolean) => void;
	onInvoke: () => void;
	onCustomize: () => void;
}

function MenuCheck({ visible }: { visible: boolean }): React.ReactElement {
	return <Check size={14} data-visible={visible ? 'true' : undefined} aria-hidden="true" />;
}

export function CommandCenterItemMenu({
	runtime,
	config,
	item,
	scope,
	portalContainer,
	open,
	onOpenChange,
	onInvoke,
	onCustomize,
}: CommandCenterItemMenuProps): React.ReactElement | null {
	const [panel, setPanel] = useState<ItemMenuPanel>('main');
	const [saving, setSaving] = useState(false);
	const contentRef = useRef<HTMLDivElement | null>(null);
	const membership = getCommandCenterItemMembership(config, item.id);
	useRovingComposite(contentRef, {
		itemSelector: '[role="menuitem"]:not([disabled]), [role="menuitemcheckbox"]:not([disabled])',
		enabled: open,
		orientation: 'vertical',
	});

	useEffect(() => {
		if (open) return;
		setPanel('main');
	}, [open]);

	if (!membership) return null;
	const currentGroupId = scope === 'home' ? membership.sourceGroupId : scope;
	const currentGroup = membership.groups.find((group) => group.id === currentGroupId);
	const groups = membership.groups;

	const run = async (operation: () => Promise<unknown>, closeAfter = false): Promise<void> => {
		if (saving) return;
		setSaving(true);
		try {
			await operation();
			if (closeAfter) onOpenChange(false);
		} catch (error) {
			console.error('[Peak Command Center] Failed to update item membership.', error);
		} finally {
			setSaving(false);
		}
	};

	const focusFirstItem = (event: Event): void => {
		event.preventDefault();
		const ownerWindow = contentRef.current?.ownerDocument.defaultView;
		ownerWindow?.requestAnimationFrame(() => {
			contentRef.current?.querySelector<HTMLElement>('[role="menuitem"], [role="menuitemcheckbox"]')?.focus();
		});
	};

	const renderDestinationPanel = (mode: 'add' | 'move'): React.ReactElement => (
		<>
			<PopoverItem role="menuitem" onClick={() => setPanel('main')}>
				<ArrowLeft size={14} /><span>Back</span>
			</PopoverItem>
			<span className="pk-cc-item-menu__label">{mode === 'add' ? 'Add to tab' : 'Move to tab'}</span>
			{groups.map((group) => {
				const current = group.id === currentGroupId;
				const disabled = saving || (mode === 'add' && group.included) || (mode === 'move' && current);
				return (
					<PopoverItem
						key={group.id}
						role={mode === 'add' ? 'menuitemcheckbox' : 'menuitem'}
						aria-checked={mode === 'add' ? group.included : undefined}
						disabled={disabled}
						className="pk-cc-item-menu__destination"
						onClick={() => {
							if (mode === 'add') {
								void run(() => runtime.setItemGroup(item.id, group.id, true));
								return;
							}
							void run(() => runtime.moveItemToGroup(item.id, group.id), true);
						}}
					>
						<span>{group.label}</span>
						{mode === 'add' ? <MenuCheck visible={group.included} /> : group.included ? <span className="pk-cc-item-menu__meta">Merge</span> : null}
					</PopoverItem>
				);
			})}
		</>
	);

	const renderMainPanel = (): React.ReactElement => (
		<>
			<span className="pk-cc-item-menu__title">{item.shortLabel}</span>
			<PopoverItem role="menuitem" onClick={() => {
				onOpenChange(false);
				onInvoke();
			}}><Play size={14} /><span>Open</span></PopoverItem>
			<PopoverItem role="menuitem" onClick={() => setPanel('add')}><Plus size={14} /><span>Add to tab…</span><ChevronRight size={13} /></PopoverItem>
			{scope === 'home' ? null : (
				<PopoverItem role="menuitem" disabled={groups.length < 2} onClick={() => setPanel('move')}><MoveRight size={14} /><span>Move to tab…</span><ChevronRight size={13} /></PopoverItem>
			)}
			{scope === 'home' ? null : (
				<PopoverItem
					role="menuitemcheckbox"
					aria-checked={membership.shownOnHome}
					disabled={saving}
					onClick={() => void run(() => runtime.setItemHome(item.id, !membership.shownOnHome))}
				>
					<House size={14} /><span>Show on Home</span><MenuCheck visible={membership.shownOnHome} />
				</PopoverItem>
			)}
			<span className="pk-cc-item-menu__separator" />
			<PopoverItem
				role="menuitem"
				disabled={saving}
				className="pk-cc-item-menu__remove"
				onClick={() => {
					if (scope === 'home') {
						void run(() => runtime.setItemHome(item.id, false), true);
						return;
					}
					void run(() => runtime.setItemGroup(item.id, currentGroupId, false), true);
				}}
			>
				<Trash2 size={14} /><span>{scope === 'home' ? 'Remove from Home' : `Remove from ${currentGroup?.label ?? item.groupLabel}`}</span>
			</PopoverItem>
			<PopoverItem role="menuitem" onClick={() => {
				onOpenChange(false);
				onCustomize();
			}}><Settings2 size={14} /><span>Customize…</span></PopoverItem>
			<span className="pk-cc-item-menu__hint">Right-click or Shift+F10</span>
		</>
	);

	return (
		<Popover open={open} onOpenChange={onOpenChange}>
			<PopoverTrigger asChild>
				<IconButton
					className="pk-cc-icon-button pk-cc-item-menu-trigger"
					label={`Manage ${item.shortLabel}`}
					title={`Manage ${item.shortLabel}`}
					aria-haspopup="menu"
					onPointerDown={(event) => event.stopPropagation()}
					onClick={(event) => event.stopPropagation()}
				>
					<MoreHorizontal size={14} />
				</IconButton>
			</PopoverTrigger>
			<PopoverContent
				ref={contentRef}
				container={portalContainer}
				align="end"
				side="bottom"
				sideOffset={4}
				className="pk-cc-item-menu"
				role="menu"
				aria-label={`Manage ${item.shortLabel}`}
				onOpenAutoFocus={focusFirstItem}
				onKeyDown={(event) => event.stopPropagation()}
			>
				{panel === 'main' ? renderMainPanel() : renderDestinationPanel(panel)}
			</PopoverContent>
		</Popover>
	);
}
