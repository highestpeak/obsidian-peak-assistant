import React, { useState, useEffect } from 'react';
import { Sparkles, X } from 'lucide-react';
import { sqliteStoreManager } from '@/core/storage/sqlite/SqliteStoreManager';
import { useQuickSearchHost } from '../hooks/useQuickSearchHost';

export function SearchUpgradePrompt() {
	const host = useQuickSearchHost();
	const [visible, setVisible] = useState(false);

	useEffect(() => {
		try {
			if (host.indexLevel !== 'fast') return;

			const dismissedAt = host.searchUpgradePromptDismissedAt;
			if (dismissedAt && Date.now() - dismissedAt < 7 * 24 * 60 * 60 * 1000) return;

			const db = sqliteStoreManager.getDatabase('vault');
			if (!db) return;

			try {
				const row = db.prepare('SELECT COUNT(*) as cnt FROM search_click').get() as { cnt: number } | undefined;
				if (!row || row.cnt < 10) return;
			} catch { return; }

			setVisible(true);
		} catch {}
	}, []);

	const handleDismiss = () => {
		setVisible(false);
		void host.setSearchUpgradePromptDismissed();
	};

	const handleOpenSettings = () => {
		host.openObsidianSettings();
	};

	if (!visible) return null;

	return (
		<div className="pktw-flex pktw-items-center pktw-gap-2 pktw-px-3 pktw-py-1.5 pktw-text-xs pktw-text-muted-foreground pktw-border-l-2 pktw-border-pk-accent">
			<Sparkles className="pktw-w-3 pktw-h-3 pktw-shrink-0" />
			<span>
				Enable semantic search for better results
				<span
					className="pktw-ml-1 pktw-underline pktw-cursor-pointer hover:pktw-text-pk-text-primary"
					onClick={handleOpenSettings}
				>
					→ Settings
				</span>
			</span>
			<button onClick={handleDismiss} className="pktw-ml-auto pktw-p-0.5 pktw-rounded hover:pktw-bg-[var(--pk-state-hover)]">
				<X className="pktw-w-3 pktw-h-3" />
			</button>
		</div>
	);
}
