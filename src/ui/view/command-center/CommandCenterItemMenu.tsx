import React, { useEffect, useRef, useState } from 'react';
import {
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
	COMMAND_CENTER_CATALOG_DEFAULTS,
	getCommandCenterItemMembership,
	type CommandCenterBoardConfig,
	type CommandCenterItemMembership,
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
import {
	createCommandCenterCustomizeIntent,
	type CommandCenterCustomizeIntent,
} from './commandCenterCustomizeIntent';

type DestinationMode = 'add' | 'move';

export interface CommandCenterItemMenuProps {
	runtime: CommandCenterRuntimePort;
	config: CommandCenterBoardConfig;
	item: ResolvedCommandCenterItem;
	scope: CommandCenterTabId;
	portalContainer: HTMLElement | null;
	open: boolean;
	onOpenChange: (open: boolean) => void;
	onInvoke: () => void;
	onCustomize: (intent: CommandCenterCustomizeIntent) => void;
}

function MenuCheck({ visible }: { visible: boolean }): React.ReactElement {
	return <Check size={14} data-visible={visible ? 'true' : undefined} aria-hidden="true" />;
}

function isDestinationSubmenuTarget(target: EventTarget | null): boolean {
	return Boolean((target as Element | null)?.closest?.('.pk-cc-item-submenu'));
}

function CommandCenterDestinationSubmenu({
	mode,
	groups,
	currentGroupId,
	portalContainer,
	open,
	saving,
	onOpenChange,
	onSelect,
}: {
	mode: DestinationMode;
	groups: CommandCenterItemMembership['groups'];
	currentGroupId: string;
	portalContainer: HTMLElement | null;
	open: boolean;
	saving: boolean;
	onOpenChange: (open: boolean) => void;
	onSelect: (groupId: string) => void;
}): React.ReactElement {
	const triggerRef = useRef<HTMLButtonElement | null>(null);
	const contentRef = useRef<HTMLDivElement | null>(null);
	const timerRef = useRef<number | null>(null);
	const timerWindowRef = useRef<Window | null>(null);
	const keyboardOpenRef = useRef(false);
	useRovingComposite(contentRef, {
		itemSelector: '[role="menuitem"]:not([disabled]), [role="menuitemcheckbox"]:not([disabled])',
		enabled: open,
		orientation: 'vertical',
	});

	const clearTimer = (): void => {
		if (timerRef.current === null) return;
		timerWindowRef.current?.clearTimeout(timerRef.current);
		timerRef.current = null;
		timerWindowRef.current = null;
	};
	const scheduleOpen = (): void => {
		clearTimer();
		const ownerWindow = triggerRef.current?.ownerDocument.defaultView;
		if (!ownerWindow) return;
		timerWindowRef.current = ownerWindow;
		timerRef.current = ownerWindow.setTimeout(() => {
			timerRef.current = null;
			timerWindowRef.current = null;
			keyboardOpenRef.current = false;
			onOpenChange(true);
		}, COMMAND_CENTER_CATALOG_DEFAULTS.submenuHoverOpenDelayMs);
	};
	const scheduleClose = (): void => {
		clearTimer();
		const ownerWindow = triggerRef.current?.ownerDocument.defaultView;
		if (!ownerWindow) return;
		timerWindowRef.current = ownerWindow;
		timerRef.current = ownerWindow.setTimeout(
			() => {
				timerRef.current = null;
				timerWindowRef.current = null;
				onOpenChange(false);
			},
			COMMAND_CENTER_CATALOG_DEFAULTS.submenuHoverCloseDelayMs,
		);
	};
	const openFromKeyboard = (): void => {
		clearTimer();
		keyboardOpenRef.current = true;
		onOpenChange(true);
	};

	useEffect(() => () => {
		if (timerRef.current === null) return;
		timerWindowRef.current?.clearTimeout(timerRef.current);
	}, []);

	const focusSubmenu = (event: Event): void => {
		event.preventDefault();
		if (!keyboardOpenRef.current) return;
		contentRef.current?.ownerDocument.defaultView?.requestAnimationFrame(() => {
			contentRef.current?.querySelector<HTMLElement>('[role="menuitem"], [role="menuitemcheckbox"]')?.focus();
		});
	};
	const restoreTriggerFocus = (event: Event): void => {
		event.preventDefault();
		if (!keyboardOpenRef.current) return;
		keyboardOpenRef.current = false;
		triggerRef.current?.focus();
	};
	const label = mode === 'add' ? 'Add to tab' : 'Move to tab';
	const TriggerIcon = mode === 'add' ? Plus : MoveRight;

	return (
		<Popover open={open} onOpenChange={onOpenChange}>
			<PopoverTrigger asChild>
				<PopoverItem
					ref={triggerRef}
					role="menuitem"
					aria-haspopup="menu"
					aria-expanded={open}
					disabled={mode === 'move' && groups.length < 2}
					onPointerEnter={scheduleOpen}
					onPointerLeave={scheduleClose}
					onClick={(event) => {
						event.preventDefault();
						keyboardOpenRef.current = false;
						onOpenChange(true);
					}}
					onKeyDown={(event) => {
						if (event.key !== 'ArrowRight' && event.key !== 'Enter' && event.key !== ' ') return;
						event.preventDefault();
						event.stopPropagation();
						openFromKeyboard();
					}}
				>
					<TriggerIcon size={14} /><span>{label}…</span><ChevronRight size={13} />
				</PopoverItem>
			</PopoverTrigger>
			<PopoverContent
				ref={contentRef}
				container={portalContainer}
				className="pk-cc-item-menu pk-cc-item-submenu"
				role="menu"
				aria-label={label}
				side="right"
				align="start"
				sideOffset={4}
				collisionPadding={8}
				onOpenAutoFocus={focusSubmenu}
				onCloseAutoFocus={restoreTriggerFocus}
				onPointerEnter={clearTimer}
				onPointerLeave={scheduleClose}
				onKeyDown={(event) => {
					event.stopPropagation();
					if (event.key !== 'ArrowLeft') return;
					event.preventDefault();
					onOpenChange(false);
					keyboardOpenRef.current = false;
					triggerRef.current?.focus();
				}}
			>
				<span className="pk-cc-item-menu__label">{label}</span>
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
							onClick={() => onSelect(group.id)}
						>
							<span>{group.label}</span>
							{mode === 'add'
								? <MenuCheck visible={group.included} />
								: current
									? <span className="pk-cc-item-menu__meta">Current</span>
									: group.included ? <span className="pk-cc-item-menu__meta">Merge</span> : null}
						</PopoverItem>
					);
				})}
			</PopoverContent>
		</Popover>
	);
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
	const [submenu, setSubmenu] = useState<DestinationMode | null>(null);
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
		setSubmenu(null);
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

	const renderMainPanel = (): React.ReactElement => (
		<>
			<span className="pk-cc-item-menu__title">{item.shortLabel}</span>
			<PopoverItem role="menuitem" onClick={() => {
				onOpenChange(false);
				onInvoke();
			}}><Play size={14} /><span>Open</span></PopoverItem>
			<CommandCenterDestinationSubmenu
				mode="add"
				groups={groups}
				currentGroupId={currentGroupId}
				portalContainer={portalContainer}
				open={submenu === 'add'}
				saving={saving}
				onOpenChange={(nextOpen) => setSubmenu(nextOpen ? 'add' : null)}
				onSelect={(groupId) => void run(() => runtime.setItemGroup(item.id, groupId, true))}
			/>
			{scope === 'home' ? null : (
				<CommandCenterDestinationSubmenu
					mode="move"
					groups={groups}
					currentGroupId={currentGroupId}
					portalContainer={portalContainer}
					open={submenu === 'move'}
					saving={saving}
					onOpenChange={(nextOpen) => setSubmenu(nextOpen ? 'move' : null)}
					onSelect={(groupId) => void run(() => runtime.moveItemToGroup(item.id, groupId), true)}
				/>
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
				onCustomize(createCommandCenterCustomizeIntent(item, currentGroupId));
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
				onInteractOutside={(event) => {
					if (isDestinationSubmenuTarget(event.target)) event.preventDefault();
				}}
				onKeyDown={(event) => event.stopPropagation()}
			>
				{renderMainPanel()}
			</PopoverContent>
		</Popover>
	);
}
