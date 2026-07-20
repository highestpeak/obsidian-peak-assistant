import React, { useState } from 'react';
import { Sliders, ChevronDown, Check, Layers } from 'lucide-react';
import {
	Segmented,
	Popover,
	PopoverTrigger,
	PopoverContent,
} from '@/ui/components/primitives';
import {
	iconForKind,
	kindLabel,
	KIND_ORDER,
	type ResourcesTabStrings,
} from './ResourcesTab';
import type {
	ResourceFilter,
	ResourceDirectionFilter,
	ResourceKindFilter,
} from './outlineModel';

/**
 * ResourcesFilterBar — the pinned filter chrome for the Resources tab (mock
 * `.right-filterbar`). Rendered by `ConversationIndex` between the tabs and the
 * scroll list so it never scrolls out of view.
 *
 * - Direction: a `Segmented` control (All / Input / Generated).
 * - Type: a single-select dropdown (`Popover`) replacing the old wrapping chip
 *   grid — one row per kind plus a leading "All types", check-marked when
 *   active (mock `.type-filter-menu`).
 */

export interface ResourcesFilterBarProps {
	filter: ResourceFilter;
	onFilterChange: (next: ResourceFilter) => void;
	strings: ResourcesTabStrings;
}

export const ResourcesFilterBar: React.FC<ResourcesFilterBarProps> = ({
	filter,
	onFilterChange,
	strings,
}) => {
	const [typeOpen, setTypeOpen] = useState(false);

	const directionOptions = [
		{ value: 'all' as ResourceDirectionFilter, label: strings.directionAll },
		{ value: 'input' as ResourceDirectionFilter, label: strings.directionInput },
		{ value: 'generated' as ResourceDirectionFilter, label: strings.directionGenerated },
	];

	const currentTypeLabel =
		filter.kind === 'all' ? strings.typeAll : kindLabel(filter.kind, strings);

	const selectKind = (kind: ResourceKindFilter): void => {
		onFilterChange({ ...filter, kind });
		setTypeOpen(false);
	};

	return (
		<div className="pkchat-idx__filterbar">
			<Segmented<ResourceDirectionFilter>
				value={filter.direction}
				onValueChange={(next) => onFilterChange({ ...filter, direction: next })}
				options={directionOptions}
			/>
			<Popover open={typeOpen} onOpenChange={setTypeOpen}>
				<PopoverTrigger asChild>
					<button
						type="button"
						className="pkchat-idx__type-trigger"
						aria-haspopup="menu"
					>
						<Sliders aria-hidden />
						<span className="pkchat-idx__type-trigger-label">{currentTypeLabel}</span>
						<ChevronDown aria-hidden />
					</button>
				</PopoverTrigger>
				<PopoverContent className="pkchat-idx__type-menu" align="end" role="menu">
					<button
						type="button"
						role="menuitemradio"
						aria-checked={filter.kind === 'all'}
						className="pkchat-idx__type-option"
						data-selected={filter.kind === 'all' ? 'true' : undefined}
						onClick={() => selectKind('all')}
					>
						<span className="pkchat-idx__type-option-icon" aria-hidden>
							<Layers aria-hidden />
						</span>
						<span className="pkchat-idx__type-option-label">{strings.typeAll}</span>
						{filter.kind === 'all' && (
							<Check className="pkchat-idx__type-option-check" aria-hidden />
						)}
					</button>
					{KIND_ORDER.map((k) => {
						const selected = filter.kind === k;
						return (
							<button
								key={k}
								type="button"
								role="menuitemradio"
								aria-checked={selected}
								className="pkchat-idx__type-option"
								data-selected={selected ? 'true' : undefined}
								onClick={() => selectKind(k)}
							>
								<span className="pkchat-idx__type-option-icon" aria-hidden>
									{iconForKind(k)}
								</span>
								<span className="pkchat-idx__type-option-label">{kindLabel(k, strings)}</span>
								{selected && (
									<Check className="pkchat-idx__type-option-check" aria-hidden />
								)}
							</button>
						);
					})}
				</PopoverContent>
			</Popover>
		</div>
	);
};
