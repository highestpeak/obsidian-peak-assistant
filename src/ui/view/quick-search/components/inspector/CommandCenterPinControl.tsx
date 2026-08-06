import React, { useEffect, useRef, useState } from 'react';
import { Check, ChevronDown, House, Pin } from 'lucide-react';
import type { CommandCenterVaultTargetMembership } from '@/core/command-center';
import { Button } from '@/ui/component/shared-ui/button';
import {
	Popover,
	PopoverContent,
	PopoverItem,
	PopoverTrigger,
} from '@/ui/components/primitives';
import { cn } from '@/ui/react/lib/utils';
import { useQuickSearchHost } from '../../hooks/useQuickSearchHost';

export function CommandCenterPinControl({ path }: { path: string }): React.ReactElement {
	const host = useQuickSearchHost();
	const [membership, setMembership] = useState<CommandCenterVaultTargetMembership | null>(() =>
		host.getCommandCenterDocumentMembership(path)
	);
	const [open, setOpen] = useState(false);
	const [saving, setSaving] = useState(false);
	const requestIdRef = useRef(0);

	useEffect(() => {
		requestIdRef.current += 1;
		setMembership(host.getCommandCenterDocumentMembership(path));
		setOpen(false);
		setSaving(false);
	}, [host, path]);

	const refresh = (): void => {
		setMembership(host.getCommandCenterDocumentMembership(path));
	};

	const update = async (
		operation: () => Promise<CommandCenterVaultTargetMembership | null>,
	): Promise<void> => {
		if (saving) return;
		const requestId = requestIdRef.current + 1;
		requestIdRef.current = requestId;
		setSaving(true);
		try {
			const next = await operation();
			if (requestIdRef.current === requestId) setMembership(next);
		} catch (error) {
			console.error('[Peak Command Center] Failed to update document membership.', error);
			if (requestIdRef.current === requestId) refresh();
		} finally {
			if (requestIdRef.current === requestId) setSaving(false);
		}
	};

	if (!membership) {
		return (
			<Button
				variant="ghost"
				size="icon"
				geometry="toolbar-icon"
				title="Peak Command Center is still loading"
				aria-label="Peak Command Center is still loading"
				className="pktw-shadow-none"
				disabled
			>
				<Pin className="pktw-h-4 pktw-w-4 pktw-text-pk-foreground-muted" />
			</Button>
		);
	}

	const includedGroups = membership.groups.filter((group) => group.included);
	const defaultGroup = membership.groups.find((group) => group.id === membership.defaultGroupId);
	const title = membership.configured
		? `In Command Center · ${includedGroups.map((group) => group.label).join(', ')}`
		: `Add to Command Center · ${defaultGroup?.label ?? 'Pinned'}`;

	const handlePrimaryClick = (): void => {
		if (membership.configured) {
			setOpen(true);
			return;
		}
		if (!membership.defaultGroupId) return;
		void update(() => host.setCommandCenterDocumentGroup(path, membership.defaultGroupId!, true));
	};

	return (
		<Popover open={open} onOpenChange={(nextOpen) => {
			setOpen(nextOpen);
			if (nextOpen) refresh();
		}}>
			<div className="pktw-flex pktw-items-center pktw-gap-0.5" aria-busy={saving}>
				<Button
					variant="ghost"
					size="icon"
					geometry="toolbar-icon"
					title={title}
					aria-label={title}
					aria-pressed={membership.configured}
					className={cn(
						'pktw-shadow-none',
						membership.configured && 'pktw-bg-pk-surface-raised pktw-text-pk-accent',
					)}
					disabled={saving || !membership.defaultGroupId}
					onClick={handlePrimaryClick}
				>
					<Pin
						className={cn('pktw-h-4 pktw-w-4', membership.configured ? 'pktw-text-pk-accent' : 'pktw-text-pk-foreground-muted')}
						fill={membership.configured ? 'currentColor' : 'none'}
					/>
				</Button>
				<PopoverTrigger asChild>
					<Button
						variant="ghost"
						size="icon"
						geometry="toolbar-icon"
						title="Choose Command Center groups"
						aria-label="Choose Command Center groups"
						className="pktw-shadow-none pktw-opacity-60 hover:pktw-opacity-100 focus-visible:pktw-opacity-100"
						disabled={saving}
					>
						<ChevronDown className="pktw-h-3.5 pktw-w-3.5 pktw-text-pk-foreground-muted" />
					</Button>
				</PopoverTrigger>
			</div>
			<PopoverContent
				align="end"
				side="bottom"
				sideOffset={6}
				className="pktw-min-w-[220px] pktw-p-1"
				role="group"
				aria-label="Command Center document destinations"
			>
				<div className="pktw-px-3 pktw-py-2 pktw-text-xs pktw-font-medium pktw-text-pk-foreground-muted">
					Command Center groups
				</div>
				{membership.groups.map((group) => (
					<PopoverItem
						key={group.id}
						role="checkbox"
						aria-checked={group.included}
						disabled={saving}
						className="pktw-justify-between"
						onClick={() => void update(() => host.setCommandCenterDocumentGroup(path, group.id, !group.included))}
					>
						<span className="pktw-min-w-0 pktw-flex-1 pktw-truncate">{group.label}</span>
						<Check className={cn('pktw-h-3.5 pktw-w-3.5', group.included ? 'pktw-opacity-100 pktw-text-pk-accent' : 'pktw-opacity-0')} />
					</PopoverItem>
				))}
				<div className="pktw-my-1 pktw-border-t pktw-border-pk-border" />
				<PopoverItem
					role="checkbox"
					aria-checked={membership.shownOnHome}
					disabled={saving}
					className="pktw-justify-between"
					onClick={() => void update(() => host.setCommandCenterDocumentHome(path, !membership.shownOnHome))}
				>
					<span className="pktw-flex pktw-min-w-0 pktw-flex-1 pktw-items-center pktw-gap-2"><House className="pktw-h-3.5 pktw-w-3.5" />Show on Home</span>
					<Check className={cn('pktw-h-3.5 pktw-w-3.5', membership.shownOnHome ? 'pktw-opacity-100 pktw-text-pk-accent' : 'pktw-opacity-0')} />
				</PopoverItem>
			</PopoverContent>
		</Popover>
	);
}
