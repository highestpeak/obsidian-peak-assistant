import React, { useState, useEffect, useCallback } from 'react';
import { Database, Sparkles, Brain, RefreshCw } from 'lucide-react';
import { Button } from '@/ui/component/shared-ui/button';
import type { IndexLevel } from '@/service/search/index/types';
import { AppContext } from '@/app/context/AppContext';
import { ProfileRegistry } from '@/core/profiles/ProfileRegistry';
import { sqliteStoreManager } from '@/core/storage/sqlite/SqliteStoreManager';
import { SectionHeader } from './components/SectionHeader';
import { SettingCard } from './components/SettingCard';
import type { SettingsUpdates } from './hooks/useSettingsUpdate';
import type { MyPluginSettings } from '@/app/settings/types';

interface SearchIndexSectionProps {
	settings: MyPluginSettings;
	settingsUpdates: SettingsUpdates;
}

const LEVEL_OPTIONS: { value: IndexLevel; label: string; description: string; icon: React.ElementType }[] = [
	{
		value: 'fast',
		label: 'Fast',
		description: 'FTS + graph only. No API calls.',
		icon: Database,
	},
	{
		value: 'semantic',
		label: 'Semantic',
		description: 'Fast + vector embeddings. Requires embedding endpoint.',
		icon: Sparkles,
	},
	{
		value: 'full',
		label: 'Full',
		description: 'Semantic + LLM tags & summaries. Requires LLM model.',
		icon: Brain,
	},
];

export function SearchIndexSection({ settings, settingsUpdates }: SearchIndexSectionProps) {
	const { updateSearch } = settingsUpdates;
	const [indexedCount, setIndexedCount] = useState<number | null>(null);
	const [isRebuilding, setIsRebuilding] = useState(false);
	const [embeddingConfigured, setEmbeddingConfigured] = useState(false);

	useEffect(() => {
		setEmbeddingConfigured(ProfileRegistry.getInstance().getActiveEmbeddingProfile() !== null);
	}, []);

	useEffect(() => {
		if (!sqliteStoreManager.isInitialized()) return;
		const { IndexService } = require('@/service/search/index/indexService');
		IndexService.getInstance()
			.getIndexStatus()
			.then((status: { indexedDocs: number | null }) => {
				setIndexedCount(status.indexedDocs);
			})
			.catch(() => {});
	}, []);

	const handleLevelChange = useCallback(
		async (level: IndexLevel) => {
			if ((level === 'semantic' || level === 'full') && !embeddingConfigured) return;
			await updateSearch('indexLevel', level);
			// Trigger staged indexing at new level in background
			try {
				const { IndexInitializer } = await import('@/service/search/index/indexInitializer');
				const ctx = AppContext.getInstance();
				const initializer = new IndexInitializer(
					ctx.app,
					ctx.plugin.settings.search,
					ctx.plugin.settings.dataStorageFolder ?? '',
				);
				initializer.performStagedFullIndexing(true, level);
			} catch (e) {
				console.error('[SearchIndexSection] Failed to start staged indexing:', e);
			}
		},
		[embeddingConfigured, updateSearch],
	);

	const handleRebuild = useCallback(async () => {
		if (isRebuilding) return;
		setIsRebuilding(true);
		try {
			const { IndexInitializer } = await import('@/service/search/index/indexInitializer');
			const ctx = AppContext.getInstance();
			const level: IndexLevel = ctx.plugin.settings.search.indexLevel ?? 'fast';
			const initializer = new IndexInitializer(
				ctx.app,
				ctx.plugin.settings.search,
				ctx.plugin.settings.dataStorageFolder ?? '',
			);
			await initializer.performStagedFullIndexing(true, level);
			// Refresh stats
			const { IndexService } = await import('@/service/search/index/indexService');
			const status = await IndexService.getInstance().getIndexStatus();
			setIndexedCount(status.indexedDocs);
		} catch (e) {
			console.error('[SearchIndexSection] Rebuild failed:', e);
		} finally {
			setIsRebuilding(false);
		}
	}, [isRebuilding]);

	const currentLevel: IndexLevel = settings.search.indexLevel ?? 'fast';

	return (
		<>
			<SectionHeader icon={Database} title="Index Level" />

			<SettingCard
				label="Index depth"
				description="Controls which enrichment steps run during indexing."
			>
				<select
					className="pktw-text-sm pktw-bg-background pktw-border pktw-border-input pktw-rounded-md pktw-px-2 pktw-py-1 pktw-cursor-pointer"
					value={currentLevel}
					onChange={(e) => handleLevelChange(e.target.value as IndexLevel)}
				>
					{LEVEL_OPTIONS.map((opt) => {
						const needsEmbedding = opt.value === 'semantic' || opt.value === 'full';
						const disabled = needsEmbedding && !embeddingConfigured;
						return (
							<option key={opt.value} value={opt.value} disabled={disabled}>
								{opt.label}
								{disabled ? ' (configure embedding first)' : ''}
							</option>
						);
					})}
				</select>
			</SettingCard>

			{(currentLevel === 'semantic' || currentLevel === 'full') && !embeddingConfigured && (
				<div className="pktw-px-4 pktw-pb-2">
					<span className="pktw-text-xs pktw-text-warning pktw-text-amber-500">
						No embedding endpoint configured. Go to Providers settings to set one up.
					</span>
				</div>
			)}

			<SettingCard
				label="Indexed files"
				description="Total documents currently in the search index."
			>
				<span className="pktw-text-sm pktw-text-muted-foreground pktw-tabular-nums">
					{indexedCount === null ? '—' : indexedCount.toLocaleString()}
				</span>
			</SettingCard>

			<SettingCard
				label="Rebuild index"
				description="Re-run the full pipeline at the current index level."
			>
				<Button
					variant="outline"
					size="sm"
					disabled={isRebuilding}
					onClick={handleRebuild}
				>
					<RefreshCw className={`pktw-w-3.5 pktw-h-3.5 pktw-mr-1.5 ${isRebuilding ? 'pktw-animate-spin' : ''}`} />
					{isRebuilding ? 'Rebuilding…' : 'Rebuild'}
				</Button>
			</SettingCard>
		</>
	);
}
