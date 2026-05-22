import React, { useState, useEffect } from 'react';
import { Sparkles, X } from 'lucide-react';
import { AppContext } from '@/app/context/AppContext';
import { sqliteStoreManager } from '@/core/storage/sqlite/SqliteStoreManager';

export function SearchUpgradePrompt() {
	const [visible, setVisible] = useState(false);

	useEffect(() => {
		try {
			const ctx = AppContext.getInstance();
			const settings = ctx.settings;
			if (!settings) return;
			if (settings.search.indexLevel !== 'fast') return;

			const dismissedAt = settings.search.searchUpgradePromptDismissedAt;
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
		try {
			const ctx = AppContext.getInstance();
			if (ctx.settings) {
				ctx.settings.search.searchUpgradePromptDismissedAt = Date.now();
				ctx.plugin.saveSettings();
			}
		} catch {}
	};

	const handleOpenSettings = () => {
		try {
			const ctx = AppContext.getInstance();
			(ctx.app as any).setting?.open?.();
		} catch {}
	};

	if (!visible) return null;

	return (
		<div className="pktw-flex pktw-items-center pktw-gap-2 pktw-px-3 pktw-py-1.5 pktw-text-xs pktw-text-muted-foreground pktw-border-l-2 pktw-border-[var(--pk-accent)]">
			<Sparkles className="pktw-w-3 pktw-h-3 pktw-shrink-0" />
			<span>
				Enable semantic search for better results
				<span
					className="pktw-ml-1 pktw-underline pktw-cursor-pointer hover:pktw-text-[var(--pk-text-primary)]"
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
