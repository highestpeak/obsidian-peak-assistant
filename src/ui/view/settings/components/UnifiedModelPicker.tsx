import React, { useMemo, useRef, useState } from 'react';
import { Check, ChevronDown, Search } from 'lucide-react';
import type { Profile, RoleConfig } from '@/core/profiles/types';
import type { ModelCapabilities } from '@/core/providers/types';
import { modelRegistry } from '@/core/providers/model-registry';
import {
	buildUnifiedModelChoices,
	type ModelCapabilityRequirement,
} from '@/core/providers/model-selection';
import { Button, Popover, PopoverContent, PopoverTrigger } from '@/ui/components/primitives';
import { ProviderIcon } from './ProviderIcon';
import { cn } from '@/ui/react/lib/utils';

export interface UnifiedModelPickerProps {
	profiles: Profile[];
	value: RoleConfig | null;
	requirement?: ModelCapabilityRequirement;
	onChange: (value: RoleConfig | null) => void;
	automaticLabel?: string;
	allowAutomatic?: boolean;
	aliases?: Record<string, string>;
	hiddenModels?: string[];
	align?: 'start' | 'center' | 'end';
	/**
	 * When a picker lives inside an Obsidian modal, keep its interactive portal
	 * inside that modal. Portalling to the document host makes Obsidian treat a
	 * click in the menu as outside the active modal and immediately dismiss it.
	 */
	portalContainer?: HTMLElement | null;
}

const CAPABILITY_FILTERS: Array<{ id: keyof ModelCapabilities; label: string }> = [
	{ id: 'reasoning', label: 'Reasoning' },
	{ id: 'vision', label: 'Vision' },
	{ id: 'tools', label: 'Tools' },
	{ id: 'webSearch', label: 'Web' },
];

export function UnifiedModelPicker({
	profiles,
	value,
	requirement = {},
	onChange,
	automaticLabel = 'Automatic',
	allowAutomatic = true,
	aliases = {},
	hiddenModels = [],
	align = 'end',
	portalContainer,
}: UnifiedModelPickerProps) {
	const [open, setOpen] = useState(false);
	const [query, setQuery] = useState('');
	const [filter, setFilter] = useState<keyof ModelCapabilities | null>(null);
	const triggerRef = useRef<HTMLButtonElement>(null);
	const searchRef = useRef<HTMLInputElement>(null);
	const hidden = useMemo(() => new Set(hiddenModels), [hiddenModels]);
	const choices = useMemo(
		() => buildUnifiedModelChoices(modelRegistry, profiles, requirement),
		[profiles, requirement],
	);
	const visible = useMemo(() => {
		const normalized = query.trim().toLowerCase();
		return choices.filter((choice) => {
			const key = `${choice.profileId}/${choice.modelId}`;
			if (hidden.has(key)) return false;
			if (filter && choice.capabilities?.[filter] !== true) return false;
			if (!normalized) return true;
			const alias = aliases[key] ?? '';
			return `${choice.profileName} ${choice.modelId} ${choice.displayName} ${alias}`.toLowerCase().includes(normalized);
		});
	}, [aliases, choices, filter, hidden, query]);
	const groups = useMemo(() => {
		const map = new Map<string, typeof visible>();
		for (const choice of visible) {
			const current = map.get(choice.profileId) ?? [];
			current.push(choice);
			map.set(choice.profileId, current);
		}
		return Array.from(map.values());
	}, [visible]);
	const selected = value
		? choices.find((choice) => choice.profileId === value.profileId && choice.modelId === value.modelId)
		: null;

	function choose(next: RoleConfig | null) {
		onChange(next);
		setOpen(false);
		setQuery('');
		setFilter(null);
	}

	function handleOpenChange(next: boolean) {
		setOpen(next);
		if (next) return;
		setQuery('');
		setFilter(null);
	}

	return (
		<Popover open={open} onOpenChange={handleOpenChange}>
			<PopoverTrigger asChild>
				<Button
					ref={triggerRef}
					variant="ghost"
					className="pk-model-trigger"
					aria-label="Choose provider and model"
					aria-haspopup="listbox"
					aria-expanded={open}
				>
					<span className="pk-model-trigger__provider">{selected?.profileName ?? automaticLabel}</span>
					<span className="pk-model-trigger__model">{selected ? aliases[`${selected.profileId}/${selected.modelId}`] ?? selected.displayName : 'Best compatible model'}</span>
					<ChevronDown size={15} />
				</Button>
			</PopoverTrigger>
			<PopoverContent
				container={portalContainer}
				align={align}
				sideOffset={8}
				collisionPadding={18}
				className="pk-model-picker"
				onOpenAutoFocus={(event) => {
					event.preventDefault();
					requestAnimationFrame(() => searchRef.current?.focus());
				}}
				onCloseAutoFocus={(event) => {
					event.preventDefault();
					triggerRef.current?.focus();
				}}
			>
				<div className="pk-model-picker__search">
					<Search size={16} />
					<input
						ref={searchRef}
						data-peak-model-search="true"
						value={query}
						onChange={(event) => setQuery(event.target.value)}
						placeholder="Search providers, models or capabilities"
					/>
				</div>
				<div className="pk-model-picker__filters" aria-label="Model capability filters">
					{CAPABILITY_FILTERS.map((item) => (
						<Button
							key={item.id}
							variant="ghost"
							size="sm"
							data-active={filter === item.id ? 'true' : 'false'}
							onClick={() => setFilter((current) => current === item.id ? null : item.id)}
						>
							{item.label}
						</Button>
					))}
				</div>
				<div className="pk-model-picker__list" role="listbox" aria-label="Available models">
					{allowAutomatic && <Button variant="ghost" role="option" aria-selected={!value} className="pk-model-picker__automatic" onClick={() => choose(null)}>
						<span><strong>{automaticLabel}</strong><small>Peak selects a compatible ready model</small></span>
						{!value && <Check size={16} />}
					</Button>}
					{groups.map((group) => (
						<div className="pk-model-picker__group" key={group[0]?.profileId}>
							<div className="pk-model-picker__group-title">
								<ProviderIcon kind={group[0].profileKind} size={24} />
								<span>{group[0].profileName}</span>
								<small>{group.length} models</small>
							</div>
							{group.map((choice) => {
								const key = `${choice.profileId}/${choice.modelId}`;
								const active = value?.profileId === choice.profileId && value.modelId === choice.modelId;
								return (
									<Button
										key={key}
										variant="ghost"
										role="option"
										aria-selected={active}
										className={cn('pk-model-picker__row', !choice.selectable && 'is-unavailable')}
										disabled={!choice.selectable}
										title={choice.unavailableReason ?? undefined}
										onClick={() => choose({ profileId: choice.profileId, modelId: choice.modelId })}
									>
										<span>
											<strong>{aliases[key] ?? choice.displayName}</strong>
											<small>{choice.modelId}</small>
										</span>
										<span className="pk-model-picker__meta">
											{choice.unavailableReason ?? (choice.capabilities?.tools ? 'Tools' : choice.modelType)}
											{active && <Check size={16} />}
										</span>
									</Button>
								);
							})}
						</div>
					))}
					{visible.length === 0 && <div className="pk-model-picker__empty">No matching model. Adjust the search or capability filter.</div>}
				</div>
			</PopoverContent>
		</Popover>
	);
}
