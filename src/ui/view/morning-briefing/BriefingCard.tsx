import React from 'react';
import { FileText, ExternalLink, X, Link2, AlertCircle, RefreshCw } from 'lucide-react';
import { Button } from '@/ui/component/shared-ui/button';
import { AppContext } from '@/app/context/AppContext';
import { useMorningBriefingStore } from '@/ui/store/morningBriefingStore';
import type { BriefingItem } from '@/service/ambient/types';

interface BriefingCardProps {
	item: BriefingItem;
}

const CATEGORY_ICONS: Record<string, React.ElementType> = {
	unresolved_connections: Link2,
	changed_hubs: RefreshCw,
	decaying_engagement: AlertCircle,
};

export const BriefingCard: React.FC<BriefingCardProps> = ({ item }) => {
	const Icon = CATEGORY_ICONS[item.category] ?? FileText;

	async function handleOpen() {
		const app = AppContext.getApp();
		await app.workspace.openLinkText(item.filePath, '', true);
	}

	function handleDismiss() {
		useMorningBriefingStore.getState().removeItem(item.filePath);
	}

	return (
		<div
			className="pktw-group pktw-flex pktw-items-start pktw-gap-2.5 pktw-rounded-md pktw-border pktw-p-3 pktw-transition-colors hover:pktw-bg-[var(--pk-state-hover)]"
			style={{ borderColor: 'var(--pk-border)' }}
		>
			<Icon
				className="pktw-mt-0.5 pktw-h-4 pktw-w-4 pktw-shrink-0"
				style={{ color: 'var(--pk-accent-text)' }}
			/>
			<div className="pktw-flex-1 pktw-min-w-0">
				<span
					className="pktw-block pktw-cursor-pointer pktw-truncate pktw-text-sm pktw-font-medium"
					style={{ color: 'var(--pk-text-primary)' }}
					onClick={handleOpen}
				>
					{item.title}
				</span>
				<span
					className="pktw-mt-0.5 pktw-block pktw-text-xs"
					style={{ color: 'var(--pk-text-secondary)' }}
				>
					{item.reason}
				</span>
			</div>
			<div className="pktw-flex pktw-gap-0.5 pktw-opacity-0 pktw-transition-opacity group-hover:pktw-opacity-100">
				<Button variant="ghost" size="xs" onClick={handleOpen} title="Open">
					<ExternalLink className="pktw-h-3 pktw-w-3" />
				</Button>
				<Button variant="ghost" size="xs" onClick={handleDismiss} title="Dismiss">
					<X className="pktw-h-3 pktw-w-3" />
				</Button>
			</div>
		</div>
	);
};
