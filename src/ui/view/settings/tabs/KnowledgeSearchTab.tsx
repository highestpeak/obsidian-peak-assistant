import React, { useState } from 'react';
import {
	Database, File, FileImage, FileJson, FileSearch, FileText, FolderSearch,
	Network, RefreshCw, Search, Settings2,
} from 'lucide-react';
import type { DocumentType } from '@/core/document/types';
import type { MyPluginSettings } from '@/core/config/settingsTypes';
import { DEFAULT_INSPECTOR_LINKS_SETTINGS } from '@/core/config/settingsTypes';
import { INDEXABLE_FILE_TYPES } from '@/core/settings/peakSettingsContract';
import { ProfileRegistry } from '@/core/profiles/ProfileRegistry';
import { ModelType } from '@/core/providers/types';
import { Button, Toggle } from '@/ui/components/primitives';
import type { SettingsUpdates } from '../hooks/useSettingsUpdate';
import { UnifiedModelPicker } from '../components/UnifiedModelPicker';

export function KnowledgeSearchTab({ settings, settingsUpdates, onOpenIndexWorkspace }: {
	settings: MyPluginSettings;
	settingsUpdates: SettingsUpdates;
	onOpenIndexWorkspace: () => void | Promise<void>;
}) {
	const [typesOpen, setTypesOpen] = useState(false);
	const [scopeOpen, setScopeOpen] = useState(false);
	const search = settings.search;
	const maintenance = search.maintenance;
	const inspector = search.inspectorLinks ?? DEFAULT_INSPECTOR_LINKS_SETTINGS;
	const profiles = ProfileRegistry.getInstance().getAllProfiles();
	const enabledTypeCount = INDEXABLE_FILE_TYPES.filter(({ type }) => search.includeDocumentTypes[type]).length;

	function updateSearch<K extends keyof MyPluginSettings['search']>(key: K, value: MyPluginSettings['search'][K]) {
		void settingsUpdates.updateSearch(key, value);
	}
	async function updateChangeDebounce(seconds: number) {
		const milliseconds = Math.max(0, seconds * 1000);
		await settingsUpdates.updateSearch('maintenance', { ...pluginSearch(), changeDebounceMs: milliseconds });
		await settingsUpdates.updateSearch('indexRefreshInterval', milliseconds);
	}
	function pluginSearch() { return settings.search.maintenance; }

	return (
		<div className="pk-settings-page">
			<header className="pk-settings-page__header">
				<span className="pk-settings-page__eyebrow">Vault readiness</span>
				<span className="pk-settings-page__title">Knowledge & Search</span>
				<span className="pk-settings-page__intro">Choose what becomes searchable and how Peak keeps the index current.</span>
			</header>

			<section className="pk-index-readiness-card">
				<div className="pk-index-readiness-card__top">
					<span><Database size={20} /><span><strong>Knowledge index</strong><small>Full-text search is available; generated knowledge can continue in the background.</small></span></span>
					<Button variant="secondary" onClick={() => void onOpenIndexWorkspace()}>Open index workspace</Button>
				</div>
				<div className="pk-index-readiness-card__meter"><span style={{ width: '100%' }} /></div>
				<div className="pk-index-readiness-card__stats"><span><strong>Ready</strong><small>Search status</small></span><span><strong>{enabledTypeCount}</strong><small>File types</small></span><span><strong>Automatic</strong><small>Changed files</small></span></div>
			</section>

			<section className="pk-settings-section">
				<div className="pk-settings-section__heading"><span><strong>Content included</strong><small>Only supported source types and the folders you choose enter the index.</small></span></div>
				<div className="pk-settings-list">
					<Button variant="ghost" className="pk-settings-disclosure" onClick={() => setTypesOpen((value) => !value)} aria-expanded={typesOpen}>
						<span><FileSearch size={18} /><span><strong>File types</strong><small>{enabledTypeCount} of {INDEXABLE_FILE_TYPES.length} included</small></span></span><span>{typesOpen ? 'Hide' : 'Choose'}</span>
					</Button>
					{typesOpen && <FileTypeChoices settings={settings} settingsUpdates={settingsUpdates} />}
					<Button variant="ghost" className="pk-settings-disclosure" onClick={() => setScopeOpen((value) => !value)} aria-expanded={scopeOpen}>
						<span><FolderSearch size={18} /><span><strong>Folders & exclusions</strong><small>{search.includeFolders.length === 0 ? 'Whole Vault' : `${search.includeFolders.length} included folders`} · {search.ignorePatterns.length} ignore rules</small></span></span><span>{scopeOpen ? 'Hide' : 'Edit'}</span>
					</Button>
					{scopeOpen && <div className="pk-settings-detail-grid">
						<label><span>Folders to include <small>One Vault-relative path per line. Leave empty for the whole Vault.</small></span><textarea value={search.includeFolders.join('\n')} onChange={(event) => updateSearch('includeFolders', splitLines(event.target.value))} placeholder="Projects/\nResearch/" /></label>
						<label><span>Ignore patterns <small>One gitignore-style pattern per line.</small></span><textarea value={search.ignorePatterns.join('\n')} onChange={(event) => updateSearch('ignorePatterns', splitLines(event.target.value))} /></label>
					</div>}
				</div>
			</section>

			<section className="pk-settings-section">
				<div className="pk-settings-section__heading"><span><strong>Keep the index current</strong><small>These defaults apply after the first run. Per-run outputs stay in the Index Workspace.</small></span></div>
				<div className="pk-settings-list">
					<ToggleRow label="Update changed files automatically" checked={search.autoIndex} onChange={(autoIndex) => updateSearch('autoIndex', autoIndex)} />
					<NumberRow label="Wait for changes to settle" value={search.indexRefreshInterval / 1000} unit="seconds" min={0} step={0.5} onChange={(seconds) => void updateChangeDebounce(seconds)} />
					<label className="pk-settings-field-row"><span><strong>When Peak starts</strong></span><select value={maintenance.onStartup} onChange={(event) => updateSearch('maintenance', { ...maintenance, onStartup: event.target.value as typeof maintenance.onStartup })}><option value="changed-files">Check changed files</option><option value="prompt">Ask before checking</option><option value="nothing">Do nothing</option></select></label>
					<details className="pk-settings-native-details"><summary><span><strong>Processing & recovery</strong><small>Large changes, batches and retries</small></span><span>{maintenance.batchSize} per batch · {maintenance.retryAttempts} retries</span></summary><div className="pk-settings-detail-grid pk-settings-detail-grid--numbers">
						<NumberRow label="Documents per batch" value={maintenance.batchSize} unit="files" min={1} onChange={(batchSize) => updateSearch('maintenance', { ...maintenance, batchSize })} />
						<NumberRow label="Retry failed documents" value={maintenance.retryAttempts} unit="times" min={0} onChange={(retryAttempts) => updateSearch('maintenance', { ...maintenance, retryAttempts })} />
					</div></details>
				</div>
			</section>

			<section className="pk-settings-section">
				<div className="pk-settings-section__heading"><span><strong>Models & generated knowledge</strong><small>Stable defaults for semantic search and enrichment.</small></span></div>
				<div className="pk-settings-list">
					<div className="pk-settings-model-row"><span><strong>Embedding model</strong><small>Changing this requires rebuilding vectors.</small></span><UnifiedModelPicker profiles={profiles} value={toRoleConfig(search.chunking.embeddingModel)} requirement={{ modelType: ModelType.EMBEDDING }} automaticLabel="Automatic embedding" onChange={(value) => void settingsUpdates.updateChunking('embeddingModel', value ? { provider: value.profileId, modelId: value.modelId } : undefined)} aliases={settings.modelCatalog.aliases} hiddenModels={settings.modelCatalog.hiddenModels} /></div>
					<details className="pk-settings-native-details"><summary><span><strong>Summary lengths</strong><small>Targets for analysis and generated document summaries</small></span><span>{search.aiAnalysisSessionSummaryWordCount} · {search.shortSummaryLength} · {search.fullSummaryLength} words</span></summary><div className="pk-settings-detail-grid pk-settings-detail-grid--numbers"><NumberRow label="Analysis session summary" value={search.aiAnalysisSessionSummaryWordCount} unit="words" min={50} onChange={(value) => updateSearch('aiAnalysisSessionSummaryWordCount', value)} /><NumberRow label="Short document summary" value={search.shortSummaryLength} unit="words" min={20} onChange={(value) => updateSearch('shortSummaryLength', value)} /><NumberRow label="Full document summary" value={search.fullSummaryLength} unit="words" min={100} onChange={(value) => updateSearch('fullSummaryLength', value)} /></div></details>
					<details className="pk-settings-native-details"><summary><span><strong>Advanced chunking</strong><small>How long documents are divided before embedding</small></span><span>6 controls</span></summary><div className="pk-settings-detail-grid pk-settings-detail-grid--numbers"><NumberRow label="Maximum chunk size" value={search.chunking.maxChunkSize} unit="chars" min={100} onChange={(value) => void settingsUpdates.updateChunking('maxChunkSize', value)} /><NumberRow label="Chunk overlap" value={search.chunking.chunkOverlap} unit="chars" min={0} onChange={(value) => void settingsUpdates.updateChunking('chunkOverlap', value)} /><NumberRow label="Minimum document size" value={search.chunking.minDocumentSizeForChunking} unit="chars" min={0} onChange={(value) => void settingsUpdates.updateChunking('minDocumentSizeForChunking', value)} /><ToggleRow label="Skip code blocks when chunking" checked={search.chunking.skipCodeBlocksInChunking ?? false} onChange={(value) => void settingsUpdates.updateChunking('skipCodeBlocksInChunking', value)} /><label className="pk-settings-field-row"><span><strong>Code block placeholder</strong></span><input value={search.chunking.codeBlockPlaceholder ?? ''} onChange={(event) => void settingsUpdates.updateChunking('codeBlockPlaceholder', event.target.value)} /></label><NumberRow label="Maximum inline code characters" value={search.chunking.maxCodeChunkChars ?? 0} unit="chars" min={0} onChange={(value) => void settingsUpdates.updateChunking('maxCodeChunkChars', value)} /></div></details>
				</div>
			</section>

			<section className="pk-settings-section pk-settings-section--last">
				<div className="pk-settings-section__heading"><span><strong>Search quality & analysis</strong><small>Durable search behaviour. Model choice stays in AI & Models.</small></span></div>
				<div className="pk-settings-list">
					<ToggleRow label="Semantic search" checked={search.indexLevel !== 'fast'} onChange={(enabled) => updateSearch('indexLevel', enabled ? 'semantic' : 'fast')} />
					<ToggleRow label="Auto-save AI Analysis results" checked={search.aiAnalysisAutoSaveEnabled} onChange={(value) => updateSearch('aiAnalysisAutoSaveEnabled', value)} />
					<details className="pk-settings-native-details"><summary><span><strong>Inspector links</strong><small>Related-note suggestions around search results</small></span><span>{inspector.keywordTopN} keywords · {inspector.tagTopN} tags</span></summary><div className="pk-settings-detail-grid pk-settings-detail-grid--numbers"><NumberRow label="Keyword links" value={inspector.keywordTopN} unit="results" min={0} onChange={(value) => void settingsUpdates.updateInspectorLinks('keywordTopN', value)} /><NumberRow label="Tag links" value={inspector.tagTopN} unit="results" min={0} onChange={(value) => void settingsUpdates.updateInspectorLinks('tagTopN', value)} /><ToggleRow label="Group links by folder" checked={inspector.folderGroupingEnabled} onChange={(value) => void settingsUpdates.updateInspectorLinks('folderGroupingEnabled', value)} /><NumberRow label="Minimum notes in a folder group" value={inspector.folderGroupMinCount} unit="notes" min={1} onChange={(value) => void settingsUpdates.updateInspectorLinks('folderGroupMinCount', value)} /><NumberRow label="Maximum folder depth" value={inspector.folderGroupMaxDepth} unit="levels" min={1} onChange={(value) => void settingsUpdates.updateInspectorLinks('folderGroupMaxDepth', value)} /></div></details>
				</div>
			</section>
		</div>
	);
}

function FileTypeChoices({ settings, settingsUpdates }: { settings: MyPluginSettings; settingsUpdates: SettingsUpdates }) {
	return <div className="pk-file-type-grid">{INDEXABLE_FILE_TYPES.map((entry) => { const Icon = fileTypeIcon(entry.type); const checked = settings.search.includeDocumentTypes[entry.type]; return <div className="pk-file-type-choice" key={entry.type}><Icon size={19} /><span><strong>{entry.label}</strong><small>{entry.capability}</small></span><Toggle checked={checked} onCheckedChange={(value) => void settingsUpdates.updateDocumentType(entry.type, value)} label={`Include ${entry.label}`} /></div>; })}</div>;
}

function fileTypeIcon(type: DocumentType) {
	if (type === 'image') return FileImage;
	if (type === 'json') return FileJson;
	if (type === 'markdown' || type === 'txt') return FileText;
	if (type === 'canvas' || type === 'excalidraw') return Network;
	return File;
}

function splitLines(value: string): string[] {
	return value.split(/\r?\n/).map((line) => line.trim()).filter(Boolean);
}

function toRoleConfig(value: { provider: string; modelId: string } | undefined) {
	return value ? { profileId: value.provider, modelId: value.modelId } : null;
}

function ToggleRow({ label, checked, onChange }: { label: string; checked: boolean; onChange: (value: boolean) => void }) {
	return <div className="pk-settings-toggle-row"><span><strong>{label}</strong></span><Toggle checked={checked} onCheckedChange={onChange} label={label} /></div>;
}

function NumberRow({ label, value, unit, min, step = 1, onChange }: { label: string; value: number; unit: string; min: number; step?: number; onChange: (value: number) => void }) {
	return <label className="pk-settings-field-row"><span><strong>{label}</strong></span><span className="pk-number-unit"><input type="number" value={value} min={min} step={step} onChange={(event) => onChange(Math.max(min, Number(event.target.value)))} /><small>{unit}</small></span></label>;
}
