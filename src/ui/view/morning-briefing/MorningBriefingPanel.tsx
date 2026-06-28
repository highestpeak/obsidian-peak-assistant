import React from 'react';
import { Sun, Link2, RefreshCw, AlertCircle } from 'lucide-react';
import { useMorningBriefingStore } from '@/ui/store/morningBriefingStore';
import { BriefingCard } from './BriefingCard';
import type { BriefingCategory } from '@/core/types/ambient';

const CATEGORY_META: Record<
	BriefingCategory,
	{ label: string; icon: React.ElementType; description: string }
> = {
	unresolved_connections: {
		label: 'Unresolved Connections',
		icon: Link2,
		description: 'Recently edited notes that could benefit from more links',
	},
	changed_hubs: {
		label: 'Updated Knowledge Clusters',
		icon: RefreshCw,
		description: 'Hub summaries that evolved since your last session',
	},
	decaying_engagement: {
		label: 'Forgotten Gems',
		icon: AlertCircle,
		description: 'Important notes you haven\'t visited recently',
	},
};

const CATEGORY_ORDER: BriefingCategory[] = [
	'unresolved_connections',
	'changed_hubs',
	'decaying_engagement',
];

export const MorningBriefingPanel: React.FC<{ onDismiss: () => void }> = ({ onDismiss }) => {
	const items = useMorningBriefingStore((s) => s.items);

	const grouped = React.useMemo(() => {
		const map = new Map<BriefingCategory, typeof items>();
		for (const cat of CATEGORY_ORDER) {
			map.set(cat, []);
		}
		for (const item of items) {
			const arr = map.get(item.category);
			if (arr) arr.push(item);
		}
		return map;
	}, [items]);

	// If all items have been dismissed, auto-close
	React.useEffect(() => {
		if (items.length === 0) {
			onDismiss();
		}
	}, [items.length, onDismiss]);

	return (
		<div className="pktw-flex pktw-flex-col pktw-gap-4 pktw-max-h-[70vh] pktw-overflow-y-auto">
			{/* Header */}
			<div className="pktw-flex pktw-items-center">
				<div className="pktw-flex pktw-items-center pktw-gap-2">
					<Sun className="pktw-h-5 pktw-w-5" style={{ color: 'var(--pk-accent-text)' }} />
					<span
						className="pktw-text-lg pktw-font-semibold"
						style={{ color: 'var(--pk-text-primary)' }}
					>
						Today's Briefing
					</span>
				</div>
			</div>

			<span className="pktw-text-xs" style={{ color: 'var(--pk-text-secondary)' }}>
				{items.length} {items.length === 1 ? 'item' : 'items'} to review
			</span>

			{/* Sections */}
			{CATEGORY_ORDER.map((cat) => {
				const catItems = grouped.get(cat) ?? [];
				if (catItems.length === 0) return null;
				const meta = CATEGORY_META[cat];
				const CatIcon = meta.icon;

				return (
					<div key={cat} className="pktw-flex pktw-flex-col pktw-gap-1.5">
						<div className="pktw-flex pktw-items-center pktw-gap-1.5">
							<CatIcon
								className="pktw-h-3.5 pktw-w-3.5"
								style={{ color: 'var(--pk-accent-text)' }}
							/>
							<span
								className="pktw-text-xs pktw-font-medium pktw-uppercase pktw-tracking-wide"
								style={{ color: 'var(--pk-text-secondary)' }}
							>
								{meta.label}
							</span>
						</div>
						<span className="pktw-text-xs" style={{ color: 'var(--pk-text-tertiary)' }}>
							{meta.description}
						</span>
						<div className="pktw-flex pktw-flex-col pktw-gap-1.5">
							{catItems.map((item) => (
								<BriefingCard key={item.filePath} item={item} />
							))}
						</div>
					</div>
				);
			})}
		</div>
	);
};
