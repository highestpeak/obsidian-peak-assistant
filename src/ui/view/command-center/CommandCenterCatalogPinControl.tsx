import React, { useEffect, useRef, useState } from 'react';
import { Check, House, Pin } from 'lucide-react';
import type {
	CommandCenterCatalogEntry,
	CommandCenterCatalogEntryMembership,
	CommandCenterRuntimePort,
} from '@/core/command-center';
import {
	IconButton,
	Popover,
	PopoverContent,
	PopoverItem,
	PopoverTrigger,
} from '@/ui/components/primitives';

export function CommandCenterCatalogPinControl({
	runtime,
	entry,
	portalContainer,
}: {
	runtime: CommandCenterRuntimePort;
	entry: CommandCenterCatalogEntry;
	portalContainer: HTMLElement | null;
}): React.ReactElement {
	const [membership, setMembership] = useState<CommandCenterCatalogEntryMembership>(() =>
		runtime.getCatalogEntryMembership(entry)
	);
	const [saving, setSaving] = useState(false);
	const requestIdRef = useRef(0);

	useEffect(() => {
		requestIdRef.current += 1;
		setMembership(runtime.getCatalogEntryMembership(entry));
		setSaving(false);
		return runtime.subscribe(() => setMembership(runtime.getCatalogEntryMembership(entry)));
	}, [entry.key, runtime]);

	const update = async (
		operation: () => Promise<CommandCenterCatalogEntryMembership>,
	): Promise<void> => {
		if (saving) return;
		const requestId = requestIdRef.current + 1;
		requestIdRef.current = requestId;
		setSaving(true);
		try {
			const next = await operation();
			if (requestIdRef.current === requestId) setMembership(next);
		} catch (error) {
			console.error('[Peak Command Center] Failed to update catalog membership.', error);
			if (requestIdRef.current === requestId) setMembership(runtime.getCatalogEntryMembership(entry));
		} finally {
			if (requestIdRef.current === requestId) setSaving(false);
		}
	};

	const includedGroups = membership.groups.filter((group) => group.included).map((group) => group.label);
	const label = membership.configured
		? `Change where ${entry.label} is pinned: ${includedGroups.join(', ')}`
		: `Pin ${entry.label} to Command Center`;

	return (
		<Popover>
			<PopoverTrigger asChild>
				<IconButton
					className="pk-cc-icon-button pk-cc-catalog-pin"
					label={label}
					title={label}
					aria-pressed={membership.configured}
					aria-busy={saving}
					data-active={membership.configured ? 'true' : undefined}
					disabled={saving || membership.groups.length === 0}
					onClick={(event) => event.stopPropagation()}
				>
					<Pin size={14} fill={membership.configured ? 'currentColor' : 'none'} />
				</IconButton>
			</PopoverTrigger>
			<PopoverContent
				container={portalContainer}
				align="end"
				side="right"
				sideOffset={6}
				className="pk-cc-catalog-pin-menu"
				role="group"
				aria-label={`Pin destinations for ${entry.label}`}
				onKeyDown={(event) => event.stopPropagation()}
			>
				<span className="pk-cc-catalog-pin-menu__title">Command Center groups</span>
				{membership.groups.map((group) => (
					<PopoverItem
						key={group.id}
						role="checkbox"
						aria-checked={group.included}
						disabled={saving}
						onClick={() => void update(() => runtime.setCatalogEntryGroup(entry, group.id, !group.included))}
					>
						<span>{group.label}</span>
						<Check size={14} data-visible={group.included ? 'true' : undefined} />
					</PopoverItem>
				))}
				<span className="pk-cc-catalog-pin-menu__separator" />
				<PopoverItem
					role="checkbox"
					aria-checked={membership.shownOnHome}
					disabled={saving}
					onClick={() => void update(() => runtime.setCatalogEntryHome(entry, !membership.shownOnHome))}
				>
					<span className="pk-cc-catalog-pin-menu__home"><House size={14} />Show on Home</span>
					<Check size={14} data-visible={membership.shownOnHome ? 'true' : undefined} />
				</PopoverItem>
			</PopoverContent>
		</Popover>
	);
}
