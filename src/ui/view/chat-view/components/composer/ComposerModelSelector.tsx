import React, { useMemo, useState } from 'react';
import { Check, ChevronDown, Search, Sliders, Sparkles, X } from 'lucide-react';
import { Popover, PopoverContent, PopoverTrigger, Pill, Segmented } from '@/ui/components/primitives';
import { ProfileRegistry } from '@/core/profiles/ProfileRegistry';
import { highlightMatch } from '@/ui/view/settings/components/model-display-utils';
import {
	buildProfileModelItems,
	filterProfileModelItems,
	groupByProfile,
	hasActiveFilters,
	emptyModelFilter,
	formatTokenFloor,
	CAPABILITY_FILTER_KEYS,
	CONTEXT_FLOORS,
	OUTPUT_FLOORS,
	type CapabilityFilterKey,
	type ModelFilterState,
	type ProfileModelItem,
} from '@/ui/component/model-picker/modelPickerData';
import type { ModelSelection } from '@/core/types/chat-studio';
import type { Profile } from '@/core/profiles/types';
import { useChatStudioStrings } from '../../chatStudioStringsContext';

/**
 * Profile-qualified model selector (chat-studio §8.5 / COMP-05).
 *
 * Trigger shows `Auto model` or `{Profile name} · {model displayName}` (never
 * the bare id). The popover mirrors the composer mock: header, sunken search +
 * a collapsed Filters affordance, a prominent Auto row, a capability note, then
 * models grouped by ENABLED profile. Rows use a provider monogram + displayName
 * primary + `id · provider` sub + neutral (catalog-declared) capability tags.
 * Search/filter/floor logic is unchanged — only presentation was aligned.
 * Data comes only from ProfileRegistry + modelRegistry — no second catalog.
 */

export interface ComposerModelSelectorProps {
	selection: ModelSelection;
	onSelect: (selection: ModelSelection) => void;
	/**
	 * Optional execution-safe profile scope. Chat Studio omits this and shows
	 * every enabled Profile; narrower surfaces such as Composer Copilot pass
	 * the Profiles their runtime can actually execute.
	 */
	profiles?: readonly Profile[];
	onSurfaceOpenChange?: (open: boolean) => void;
}

function triggerLabel(selection: ModelSelection, items: ProfileModelItem[], autoLabel: string): string {
	if (selection.mode === 'auto') return autoLabel;
	const item = items.find((i) => i.profileId === selection.profileId && i.modelId === selection.modelId);
	const profileName = item?.profileName ?? selection.profileId;
	const name = item?.displayName ?? selection.modelId;
	return `${profileName} · ${name}`;
}

function providerName(kind: string): string {
	return kind.charAt(0).toUpperCase() + kind.slice(1);
}

export const ComposerModelSelector: React.FC<ComposerModelSelectorProps> = ({
	selection,
	onSelect,
	profiles,
	onSurfaceOpenChange,
}) => {
	const strings = useChatStudioStrings();
	const [open, setOpen] = useState(false);
	const [filterOpen, setFilterOpen] = useState(false);
	const [filter, setFilter] = useState<ModelFilterState>(emptyModelFilter());
	const changeOpen = (next: boolean) => {
		setOpen(next);
		onSurfaceOpenChange?.(next);
		if (!next) return;
		setFilter(emptyModelFilter());
		setFilterOpen(false);
	};

	const allItems = useMemo(
		() => buildProfileModelItems(profiles ?? ProfileRegistry.getInstance().getAllProfiles()),
		[open, profiles],
	);
	const filtered = useMemo(() => filterProfileModelItems(allItems, filter), [allItems, filter]);
	const groups = useMemo(() => groupByProfile(filtered), [filtered]);

	// Capability short labels — one set drives both the filter pills and the
	// per-row capability tags (no inline label map; configurability.md).
	const capLabel: Record<CapabilityFilterKey, string> = {
		vision: strings.composer.capVision,
		pdfInput: strings.composer.capPdfInput,
		tools: strings.composer.capTools,
		webSearch: strings.composer.capWebSearch,
		reasoning: strings.composer.capReasoning,
		imageGeneration: strings.composer.capImageGeneration,
	};

	const rowCapTags = (item: ProfileModelItem): string[] => {
		const caps = item.capabilities;
		const tags: string[] = [];
		if (!caps) return tags;
		if (caps.reasoning) tags.push(strings.composer.capReasoning);
		if (caps.vision) tags.push(strings.composer.capVision);
		if (caps.pdfInput) tags.push(strings.composer.capPdfInput);
		if (caps.tools) tags.push(strings.composer.capTools);
		if (caps.webSearch) tags.push(strings.composer.capWebSearch);
		const ctx = item.tokenLimits?.maxInputTokens ?? item.tokenLimits?.maxTokens ?? caps.maxCtx;
		if (typeof ctx === 'number') tags.push(formatTokenFloor(ctx));
		const out = item.tokenLimits?.maxOutputTokens;
		if (typeof out === 'number') tags.push(`${strings.composer.capOutputPrefix} ${formatTokenFloor(out)}`);
		return tags;
	};

	const filterCount = filter.capabilities.length + (filter.contextFloor !== 0 ? 1 : 0) + (filter.outputFloor !== 0 ? 1 : 0);

	const toggleCapability = (key: CapabilityFilterKey) => {
		setFilter((f) => ({
			...f,
			capabilities: f.capabilities.includes(key)
				? f.capabilities.filter((k) => k !== key)
				: [...f.capabilities, key],
		}));
	};

	const pick = (item: ProfileModelItem) => {
		onSelect({ mode: 'fixed', profileId: item.profileId, modelId: item.modelId });
		changeOpen(false);
	};

	const useAuto = () => {
		onSelect({ mode: 'auto' });
		changeOpen(false);
	};

	const isSelected = (item: ProfileModelItem) =>
		selection.mode === 'fixed' && selection.profileId === item.profileId && selection.modelId === item.modelId;

	return (
		<Popover open={open} onOpenChange={changeOpen}>
			<PopoverTrigger asChild>
				<button
					type="button"
					className="pkchat-run-chip"
					data-state={open ? 'open' : 'closed'}
					aria-label={strings.composer.modelAutoLabel}
				>
					{selection.mode === 'auto' && <Sparkles aria-hidden />}
					<span className="pkchat-run-chip__mid">
						{triggerLabel(selection, allItems, strings.composer.modelAutoLabel)}
					</span>
					<ChevronDown />
				</button>
			</PopoverTrigger>
			<PopoverContent align="end" side="top" sideOffset={8} className="pktw-p-0">
				<div className="pktw-w-[372px] pktw-flex pktw-flex-col" style={{ maxHeight: 'min(580px, calc(100vh - 86px))' }}>
					{/* Header */}
					<div className="pktw-flex pktw-flex-col pktw-gap-0.5 pktw-px-[9px] pktw-py-[7px] pktw-min-h-[54px] pktw-justify-center pktw-border-b pktw-border-pk-border-soft">
						<span className="pktw-text-xs pktw-font-[650] pktw-text-pk-text-primary">
							{strings.composer.modelPickerTitle}
						</span>
						<span className="pktw-text-pk-xs pktw-text-pk-text-tertiary pktw-truncate">
							{strings.composer.modelPickerSubtitle}
						</span>
					</div>

					<div className="pktw-flex-1 pktw-overflow-y-auto pktw-p-[7px]">
						{/* Search + Filters toggle */}
						<div className="pktw-grid pktw-grid-cols-[minmax(0,1fr)_auto] pktw-items-center pktw-gap-1.5 pktw-mb-[7px]">
							<label className="pktw-flex pktw-items-center pktw-gap-1.5 pktw-h-[34px] pktw-px-[9px] pktw-bg-pk-surface-sunken pktw-border pktw-border-pk-border-soft pktw-rounded-[var(--pk-radius-md)]">
								<Search className="pktw-w-[13px] pktw-h-[13px] pktw-text-pk-text-tertiary pktw-shrink-0" />
								<input
									type="text"
									autoFocus
									value={filter.query}
									onChange={(e) => setFilter((f) => ({ ...f, query: e.target.value }))}
									placeholder={strings.composer.modelPickerPlaceholder}
									className="pktw-flex-1 pktw-min-w-0 pktw-bg-transparent pktw-border-0 pktw-outline-none pktw-text-pk-sm pktw-text-pk-text-primary placeholder:pktw-text-pk-text-tertiary"
								/>
							</label>
							<button
								type="button"
								className="pkchat-modelpick__filter"
								data-active={filterCount > 0 ? 'true' : undefined}
								aria-expanded={filterOpen}
								onClick={() => setFilterOpen((v) => !v)}
							>
								<Sliders />
								<span>{strings.composer.modelFilterToggle}</span>
								{filterCount > 0 && <em>{filterCount}</em>}
							</button>
						</div>

						{/* Collapsible filter panel */}
						{filterOpen && (
							<div className="pkchat-modelpick__panel">
								<div className="pkchat-modelpick__filter-row">
									<span>{strings.composer.modelFilterHeader}</span>
									<div className="pktw-flex pktw-flex-wrap pktw-gap-1">
										{CAPABILITY_FILTER_KEYS.map((key) => (
											<Pill
												key={key}
												selected={filter.capabilities.includes(key)}
												onClick={() => toggleCapability(key)}
												className="pktw-text-pk-xs"
											>
												{capLabel[key]}
											</Pill>
										))}
									</div>
								</div>
								<div className="pkchat-modelpick__filter-row">
									<span>{strings.composer.modelContextHeader}</span>
									<Segmented
										value={String(filter.contextFloor)}
										onValueChange={(v: string) => setFilter((f) => ({ ...f, contextFloor: Number(v) as ModelFilterState["contextFloor"] }))}
										options={CONTEXT_FLOORS.map((floor) => ({
											value: String(floor),
											label: floor === 0 ? strings.composer.modelFloorAll : `≥${formatTokenFloor(floor)}`,
										}))}
									/>
								</div>
								<div className="pkchat-modelpick__filter-row">
									<span>{strings.composer.modelOutputHeader}</span>
									<Segmented
										value={String(filter.outputFloor)}
										onValueChange={(v: string) => setFilter((f) => ({ ...f, outputFloor: Number(v) as ModelFilterState["outputFloor"] }))}
										options={OUTPUT_FLOORS.map((floor) => ({
											value: String(floor),
											label: floor === 0 ? strings.composer.modelFloorAll : `≥${formatTokenFloor(floor)}`,
										}))}
									/>
								</div>
								{hasActiveFilters(filter) && (
									<button
										type="button"
										className="pkchat-modelpick__filter-clear"
										onClick={() => setFilter((f) => ({ ...emptyModelFilter(), query: f.query }))}
									>
										<X className="pktw-w-3 pktw-h-3" />
										{strings.composer.modelClearFilters}
									</button>
								)}
							</div>
						)}

						{/* Auto (prominent) */}
						<button
							type="button"
							className="pkchat-modelpick__auto"
							data-selected={selection.mode === 'auto' ? 'true' : undefined}
							onClick={useAuto}
						>
							<span className="pkchat-modelpick__mono"><Sparkles className="pktw-w-3.5 pktw-h-3.5 pktw-text-pk-accent" /></span>
							<span className="pktw-min-w-0">
								<span className="pktw-block pktw-text-pk-sm pktw-font-semibold pktw-text-pk-text-primary">{strings.composer.modelUseAuto}</span>
								<span className="pktw-block pktw-text-pk-xs pktw-text-pk-text-tertiary">{strings.composer.modelUseAutoDescription}</span>
							</span>
							{selection.mode === 'auto' && <Check className="pktw-w-3.5 pktw-h-3.5 pktw-shrink-0 pktw-text-pk-accent-text" />}
						</button>

						{/* Capability note */}
						<div className="pkchat-modelpick__note">{strings.composer.modelCapabilityNote}</div>

						{/* Grouped models */}
						{groups.map((group) => (
							<div key={group.profile.id} className="pkchat-modelpick__group">
								<div className="pkchat-modelpick__group-label">{group.profile.name}</div>
								{group.items.map((item) => (
									<button
										key={`${item.profileId}-${item.modelId}`}
										type="button"
										onClick={() => pick(item)}
										className="pkchat-modelpick__row"
										data-selected={isSelected(item) ? 'true' : undefined}
									>
										<span className="pkchat-modelpick__mono">{providerName(item.profileKind).charAt(0)}</span>
										<span className="pktw-min-w-0">
											<span className="pktw-block pktw-truncate pktw-text-pk-sm pktw-font-semibold pktw-text-pk-text-primary">
												{highlightMatch(item.displayName ?? item.modelId, filter.query)}
											</span>
											<span className="pktw-block pktw-truncate pktw-text-pk-xs pktw-text-pk-text-tertiary">
												{item.modelId} · {providerName(item.profileKind)}
											</span>
											{rowCapTags(item).length > 0 && (
												<span className="pkchat-modelpick__cap-row">
													{rowCapTags(item).map((tag, i) => (
														<span key={`${tag}-${i}`} className="pkchat-modelpick__cap">{tag}</span>
													))}
												</span>
											)}
										</span>
										{isSelected(item) && <Check className="pktw-w-3.5 pktw-h-3.5 pktw-shrink-0 pktw-text-pk-accent-text" />}
									</button>
								))}
							</div>
						))}
						{filtered.length === 0 && (
							<div className="pktw-px-3 pktw-py-4 pktw-text-xs pktw-text-pk-text-tertiary pktw-text-center">
								{strings.composer.modelPickerEmpty}
							</div>
						)}
					</div>
				</div>
			</PopoverContent>
		</Popover>
	);
};
