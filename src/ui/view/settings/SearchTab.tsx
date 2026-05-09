import React, { useState, useEffect } from 'react';
import { Database, Scissors, Sparkles } from 'lucide-react';
import type { MyPluginSettings } from '@/app/settings/types';
import type { SettingsUpdates } from './hooks/useSettingsUpdate';
import { Switch } from '@/ui/component/shared-ui/switch';
import { Button } from '@/ui/component/shared-ui/button';
import { Input } from '@/ui/component/shared-ui/input';
import { NumberInputWithConfirm } from '@/ui/component/shared-ui/number-input';
import { SettingCard } from './components/SettingCard';
import { SectionHeader } from './components/SectionHeader';
import { DocTypePills } from './components/DocTypePills';

interface SearchTabProps {
	settings: MyPluginSettings;
	settingsUpdates: SettingsUpdates;
}

export function SearchTab({ settings, settingsUpdates }: SearchTabProps) {
	const { updateSearch, updateChunking, updateDocumentType } = settingsUpdates;

	const [editingPatterns, setEditingPatterns] = useState(false);
	const [patternsText, setPatternsText] = useState('');

	useEffect(() => {
		setPatternsText(settings.search.ignorePatterns?.join('\n') ?? '');
	}, [settings.search.ignorePatterns]);

	const saveIgnorePatterns = () => {
		const patterns = patternsText.split('\n').map((l) => l.trim()).filter(Boolean);
		updateSearch('ignorePatterns', patterns);
		setEditingPatterns(false);
	};

	return (
		<div className="pktw-flex pktw-flex-col pktw-gap-1.5 pktw-mt-4">
			{/* ── Indexing ── */}
			<SectionHeader icon={Database} title="Indexing" />

			<SettingCard label="Auto-index on startup" description="Run FTS index when Obsidian opens">
				<Switch
					checked={settings.search.autoIndex}
					onChange={(v) => updateSearch('autoIndex', v)}
				/>
			</SettingCard>

			<SettingCard
				label="Document types"
				description="File types included in the search index"
				stacked
			>
				<DocTypePills
					types={settings.search.includeDocumentTypes}
					onToggle={(type, val) => updateDocumentType(type, val)}
				/>
			</SettingCard>

			<SettingCard label="Ignore patterns" description="Glob patterns to exclude (one per line)">
				<Button variant="outline" size="sm" onClick={() => setEditingPatterns(!editingPatterns)}>
					{editingPatterns ? 'Close' : 'Edit'}
				</Button>
			</SettingCard>
			{editingPatterns && (
				<div className="pktw-px-4 pktw-pb-2 pktw-space-y-2">
					<textarea
						value={patternsText}
						onChange={(e) => setPatternsText(e.target.value)}
						placeholder={'.git/\nnode_modules/\n*.tmp'}
						className="pktw-w-full pktw-h-28 pktw-px-3 pktw-py-2 pktw-border pktw-border-border pktw-rounded-md pktw-text-xs pktw-font-mono pktw-resize-vertical focus:pktw-outline-none focus:pktw-ring-2 focus:pktw-ring-ring"
					/>
					<Button size="sm" onClick={saveIgnorePatterns}>Save</Button>
				</div>
			)}

			{/* ── Chunking ── */}
			<SectionHeader icon={Scissors} title="Chunking" />

			<SettingCard label="Max chunk size" description="Maximum characters per chunk (default 1000)">
				<div className="pktw-w-36">
					<NumberInputWithConfirm
						value={settings.search.chunking?.maxChunkSize ?? 1000}
						onConfirm={(v) => updateChunking('maxChunkSize', v)}
						min={1}
						placeholder="1000"
					/>
				</div>
			</SettingCard>

			<SettingCard label="Chunk overlap" description="Overlap characters between chunks (default 200)">
				<div className="pktw-w-36">
					<NumberInputWithConfirm
						value={settings.search.chunking?.chunkOverlap ?? 200}
						onConfirm={(v) => updateChunking('chunkOverlap', v)}
						min={0}
						placeholder="200"
					/>
				</div>
			</SettingCard>

			{/* ── AI Analysis ── */}
			<SectionHeader icon={Sparkles} title="AI Analysis" />

			<SettingCard label="Auto-save results" description="Save completed analysis to vault">
				<Switch
					checked={settings.search.aiAnalysisAutoSaveEnabled ?? true}
					onChange={(v) => updateSearch('aiAnalysisAutoSaveEnabled', v)}
				/>
			</SettingCard>

			<SettingCard label="Save folder" description="Vault-relative path for saved analyses">
				<div className="pktw-w-48">
					<Input
						value={settings.search.aiAnalysisAutoSaveFolder ?? 'Analysis/AI Searches'}
						onChange={(e) => updateSearch('aiAnalysisAutoSaveFolder', e.target.value)}
						placeholder="Analysis/AI Searches"
					/>
				</div>
			</SettingCard>

			<SettingCard label="Recent history limit" description="Items shown in Recent AI Analysis list">
				<div className="pktw-w-36">
					<NumberInputWithConfirm
						value={settings.search.aiAnalysisHistoryLimit ?? 5}
						onConfirm={(v) => updateSearch('aiAnalysisHistoryLimit', v)}
						min={1}
						max={50}
						placeholder="5"
					/>
				</div>
			</SettingCard>
		</div>
	);
}
