import React from 'react';
import { Zap, RefreshCw } from 'lucide-react';
import { Button } from '@/ui/component/shared-ui/button';
import { useAmbientPushStore } from '@/ui/store/ambientPushStore';
import { AmbientPushService } from '@/service/ambient/AmbientPushService';
import { AppContext } from '@/app/context/AppContext';
import { PushCard } from './PushCard';

function formatElapsed(ts: number): string {
	if (ts === 0) return '';
	const diff = Math.floor((Date.now() - ts) / 1000);
	if (diff < 60) return `${diff}s ago`;
	return `${Math.floor(diff / 60)}m ago`;
}

export const AmbientPushPanel: React.FC = () => {
	const items = useAmbientPushStore((s) => s.items);
	const lastUpdateTs = useAmbientPushStore((s) => s.lastUpdateTs);

	// Re-render elapsed time periodically
	const [, setTick] = React.useState(0);
	React.useEffect(() => {
		if (lastUpdateTs === 0) return;
		const id = setInterval(() => setTick((t) => t + 1), 30_000);
		return () => clearInterval(id);
	}, [lastUpdateTs]);

	function handleRefresh() {
		AmbientPushService.getInstance().triggerManual();
	}

	// Derive sourceFilePath from active file
	const sourceFilePath = AppContext.getApp().workspace.getActiveFile()?.path ?? '';

	return (
		<div className="pktw-flex pktw-h-full pktw-flex-col">
			{/* Header */}
			<div className="pktw-flex pktw-items-center pktw-gap-2 pktw-border-b pktw-px-3 pktw-py-2"
				style={{ borderColor: 'var(--background-modifier-border)' }}>
				<Zap className="pktw-h-4 pktw-w-4" style={{ color: 'var(--text-accent)' }} />
				<span className="pktw-flex-1 pktw-text-sm pktw-font-medium" style={{ color: 'var(--text-normal)' }}>
					Related Notes
				</span>
				<Button variant="ghost" size="xs" onClick={handleRefresh} title="Refresh">
					<RefreshCw className="pktw-h-3.5 pktw-w-3.5" />
				</Button>
			</div>

			{/* Content */}
			{items.length === 0 ? (
				<div className="pktw-flex pktw-flex-1 pktw-flex-col pktw-items-center pktw-justify-center pktw-gap-2 pktw-px-4">
					<Zap className="pktw-h-8 pktw-w-8 pktw-opacity-20" style={{ color: 'var(--text-faint)' }} />
					<span className="pktw-text-center pktw-text-xs" style={{ color: 'var(--text-faint)' }}>
						Start writing to see related notes
					</span>
				</div>
			) : (
				<div className="pktw-flex-1 pktw-space-y-2 pktw-overflow-y-auto pktw-p-2">
					{items.map((item) => (
						<PushCard key={item.filePath} item={item} sourceFilePath={sourceFilePath} />
					))}
				</div>
			)}

			{/* Footer */}
			{items.length > 0 && (
				<div className="pktw-flex pktw-items-center pktw-justify-between pktw-border-t pktw-px-3 pktw-py-1.5"
					style={{ borderColor: 'var(--background-modifier-border)' }}>
					<span className="pktw-text-xs" style={{ color: 'var(--text-faint)' }}>
						{items.length} {items.length === 1 ? 'note' : 'notes'}
					</span>
					<span className="pktw-text-xs" style={{ color: 'var(--text-faint)' }}>
						{formatElapsed(lastUpdateTs)}
					</span>
				</div>
			)}
		</div>
	);
};
