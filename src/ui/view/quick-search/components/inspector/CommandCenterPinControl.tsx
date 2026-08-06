import React, { useEffect, useRef, useState } from 'react';
import { Check, House, Pin } from 'lucide-react';
import type { CommandCenterVaultTargetMembership } from '@/core/command-center';
import { Button } from '@/ui/component/shared-ui/button';
import {
	Popover,
	PopoverContent,
	PopoverItem,
	PopoverTrigger,
} from '@/ui/components/primitives';
import { useQuickSearchHost } from '../../hooks/useQuickSearchHost';

export function CommandCenterPinControl({
	path,
	portalContainer,
}: {
	path: string;
	portalContainer: HTMLElement | null;
}): React.ReactElement {
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
	}, [path]);

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
				variant="unstyled"
				size="icon"
				geometry="toolbar-icon"
				title="Peak Command Center is still loading"
				aria-label="Peak Command Center is still loading"
				className="pk-icon-btn pk-inspector-icon-button pktw-shadow-none"
				disabled
			>
				<Pin className="pktw-h-4 pktw-w-4" />
			</Button>
		);
	}

	const includedGroups = membership.groups.filter((group) => group.included);
	const destinations = [
		...(membership.shownOnHome ? ['Home'] : []),
		...includedGroups.map((group) => group.label),
	];
	const active = membership.configured || membership.shownOnHome;
	const title = active
		? `Manage Command Center destinations · ${destinations.join(', ')}`
		: 'Pin to Peak Command Center';

	return (
		<Popover open={open} onOpenChange={(nextOpen) => {
			setOpen(nextOpen);
			if (nextOpen) refresh();
		}}>
			<PopoverTrigger asChild>
				<Button
					variant="unstyled"
					size="icon"
					geometry="toolbar-icon"
					title={title}
					aria-label={title}
					aria-pressed={active}
					aria-busy={saving}
					data-active={active ? 'true' : undefined}
					className="pk-icon-btn pk-inspector-icon-button pktw-shadow-none"
					disabled={saving}
				>
					<Pin
						className="pktw-h-4 pktw-w-4"
						fill={active ? 'currentColor' : 'none'}
					/>
				</Button>
			</PopoverTrigger>
			<PopoverContent
				container={portalContainer}
				align="end"
				side="bottom"
				sideOffset={6}
				className="pk-inspector-pin-menu pktw-min-w-[236px] pktw-p-1"
				role="group"
				aria-label="Command Center document destinations"
			>
				<div className="pktw-px-3 pktw-py-2 pktw-text-xs pktw-font-medium pktw-text-pk-foreground-muted">
					Pin to Peak Command Center
				</div>
				<PopoverItem
					role="checkbox"
					aria-checked={membership.shownOnHome}
					disabled={saving}
					className="pktw-justify-between"
					onClick={() => void update(() => host.setCommandCenterDocumentHome(path, !membership.shownOnHome))}
				>
					<span className="pktw-flex pktw-min-w-0 pktw-flex-1 pktw-items-center pktw-gap-2">
						<House className="pktw-h-3.5 pktw-w-3.5" />
						<span className="pktw-min-w-0 pktw-flex-1"><span className="pktw-block">Home · Recommended</span><span className="pktw-block pktw-text-[10px] pktw-text-pk-foreground-muted">Keep it in your launcher overview</span></span>
					</span>
					{membership.shownOnHome ? <Check className="pktw-h-3.5 pktw-w-3.5" aria-hidden="true" /> : null}
				</PopoverItem>
				<div className="pktw-my-1 pktw-border-t pktw-border-pk-border" />
				<div className="pktw-px-3 pktw-py-1.5 pktw-text-[10px] pktw-font-semibold pktw-uppercase pktw-tracking-wide pktw-text-pk-foreground-muted">
					Tabs
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
						{group.included ? <Check className="pktw-h-3.5 pktw-w-3.5" aria-hidden="true" /> : null}
					</PopoverItem>
				))}
			</PopoverContent>
		</Popover>
	);
}
