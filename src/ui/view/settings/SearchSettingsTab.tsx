import React, { useMemo, useState, useEffect } from 'react';
import { MyPluginSettings } from '@/app/settings/types';
import { Switch } from '@/ui/component/shared-ui/switch';
import { Button } from '@/ui/component/shared-ui/button';
import { NumberInputWithConfirm } from '@/ui/component/shared-ui/number-input';
import { DocumentType, DOCUMENT_TYPES } from '@/core/document/types';
import type { SettingsUpdates } from './hooks/useSettingsUpdate';

interface SearchSettingsTabProps {
	settings: MyPluginSettings;
	settingsUpdates: SettingsUpdates;
}

/**
 * Search settings tab for configuring search indexing and chunking.
 */
export function SearchSettingsTab({ settings, settingsUpdates }: SearchSettingsTabProps) {
	const { updateSearch, updateChunking, updateDocumentType } = settingsUpdates;

	// Local state for textarea to avoid input issues
	const [ignorePatternsText, setIgnorePatternsText] = useState('');

	// Sync local state with settings
	useEffect(() => {
		setIgnorePatternsText(settings.search.ignorePatterns?.join('\n') ?? '');
	}, [settings.search.ignorePatterns]);

	// Check if there are unsaved changes
	const hasUnsavedChanges = ignorePatternsText !== (settings.search.ignorePatterns?.join('\n') ?? '');

	// Save function
	const saveIgnorePatterns = () => {
		const patterns = ignorePatternsText
			.split('\n')
			.map(line => line.trim())
			.filter(line => line.length > 0);
		updateSearch('ignorePatterns', patterns);
	};

	// Sort document types alphabetically
	const sortedDocumentTypes = useMemo(() => {
		return [...DOCUMENT_TYPES].sort((a, b) => a.localeCompare(b, undefined, { sensitivity: 'base' }));
	}, []);

	return (
		<div className="peak-settings-card">
			<div className="pktw-mb-6">
				<h3 className="pktw-text-lg pktw-font-semibold pktw-text-foreground pktw-mb-2">Search Settings</h3>
				<p className="pktw-text-sm pktw-text-muted-foreground">
					Configure search indexing behavior and document chunking settings.
				</p>
			</div>

			{/* Auto Index on Startup */}
			<div className="pktw-mb-8">
				<div className="pktw-flex pktw-items-start pktw-gap-4">
					{/* Left side: label and description */}
					<div className="pktw-flex-1 pktw-min-w-0">
						<label className="pktw-block pktw-text-sm pktw-font-medium pktw-text-foreground pktw-mb-1">
							Auto Index on Startup
						</label>
						<p className="pktw-text-xs pktw-text-muted-foreground">
							Automatically index files when Obsidian opens. If disabled, you can manually trigger indexing via command palette (Command+P: "Index Search").
						</p>
					</div>
					{/* Right side: switch */}
					<div className="pktw-flex-shrink-0 pktw-flex pktw-items-center">
						<Switch checked={settings.search.autoIndex} onChange={(value) => updateSearch('autoIndex', value)} />
					</div>
				</div>
			</div>

			{/* Index Document Types */}
			<div className="pktw-mb-8">
				<div className="pktw-mb-4">
					<label className="pktw-block pktw-text-sm pktw-font-medium pktw-text-foreground pktw-mb-1">
						Index Document Types
					</label>
					<p className="pktw-text-xs pktw-text-muted-foreground">
						Select which file types to include in search index.
					</p>
				</div>
				<div className="pktw-grid pktw-grid-cols-4 pktw-gap-3">
					{sortedDocumentTypes.map((type) => (
						<div
							key={type}
							className="pktw-flex pktw-items-center pktw-justify-between pktw-px-3 pktw-py-2 pktw-border pktw-border-border pktw-rounded-md pktw-h-10 hover:pktw-bg-muted/50 pktw-transition-colors"
						>
							<span className="pktw-text-sm pktw-text-foreground">{type}</span>
							<Switch
								checked={settings.search.includeDocumentTypes[type] ?? false}
								onChange={(checked) => updateDocumentType(type, checked)}
							/>
						</div>
					))}
				</div>
			</div>

			{/* Ignore Patterns */}
			<div className="pktw-mb-8">
				<div className="pktw-flex pktw-items-start pktw-gap-4">
					{/* Left side: label and description */}
					<div className="pktw-flex-1 pktw-min-w-0">
						<label className="pktw-block pktw-text-sm pktw-font-medium pktw-text-foreground pktw-mb-1">
							Ignore Patterns
						</label>
						<p className="pktw-text-xs pktw-text-muted-foreground pktw-mb-2">
							File/directory patterns to exclude from indexing (similar to .gitignore). One pattern per line.
							<br />
							Examples: .git/, node_modules/, *.tmp, temp/*.log
						</p>
						<textarea
							value={ignorePatternsText}
							onChange={(e) => {
								setIgnorePatternsText(e.target.value);
							}}
							placeholder={'.git/\nnode_modules/\n*.tmp\ntemp/*.log\n.DS_Store\nThumbs.db'}
							className="pktw-w-full pktw-h-32 pktw-px-3 pktw-py-2 pktw-border pktw-border-border pktw-rounded-md pktw-text-sm pktw-font-mono pktw-placeholder-muted-foreground focus:pktw-outline-none focus:pktw-ring-2 focus:pktw-ring-ring focus:pktw-border-transparent pktw-resize-vertical"
						/>
						{hasUnsavedChanges && (
							<div className="pktw-mt-2 pktw-flex pktw-items-center pktw-gap-2">
								<span className="pktw-text-xs pktw-text-amber-600">You have unsaved changes</span>
								<Button
									onClick={saveIgnorePatterns}
									size="sm"
									className="pktw-text-xs"
								>
									Save Changes
								</Button>
							</div>
						)}
					</div>
				</div>
			</div>

			{/* Document Chunking Settings */}
			<div className="pktw-border-t pktw-border-border pktw-pt-6">
				<div className="pktw-mb-6">
					<h4 className="pktw-text-base pktw-font-semibold pktw-text-foreground pktw-mb-1">Document Chunking Settings</h4>
					<p className="pktw-text-xs pktw-text-muted-foreground">
						Configure how documents are split into chunks for embedding and vector search.
					</p>
				</div>
				<div className="pktw-space-y-6">
					{/* Max Chunk Size */}
					<div className="pktw-flex pktw-items-start pktw-gap-4">
						{/* Left side: label and description */}
						<div className="pktw-flex-1 pktw-min-w-0">
							<label className="pktw-block pktw-text-sm pktw-font-medium pktw-text-foreground pktw-mb-1">
								Max Chunk Size
							</label>
							<p className="pktw-text-xs pktw-text-muted-foreground">
								Maximum characters per chunk. Default: 1000
							</p>
						</div>
						{/* Right side: input */}
						<div className="pktw-flex-shrink-0 pktw-w-64">
							<NumberInputWithConfirm
								value={settings.search.chunking?.maxChunkSize ?? 1000}
								onConfirm={(value) => updateChunking('maxChunkSize', value)}
								min={1}
								placeholder="1000"
							/>
						</div>
					</div>

					{/* Chunk Overlap */}
					<div className="pktw-flex pktw-items-start pktw-gap-4">
						{/* Left side: label and description */}
						<div className="pktw-flex-1 pktw-min-w-0">
							<label className="pktw-block pktw-text-sm pktw-font-medium pktw-text-foreground pktw-mb-1">
								Chunk Overlap
							</label>
							<p className="pktw-text-xs pktw-text-muted-foreground">
								Characters of overlap between chunks. Default: 200
							</p>
						</div>
						{/* Right side: input */}
						<div className="pktw-flex-shrink-0 pktw-w-64">
							<NumberInputWithConfirm
								value={settings.search.chunking?.chunkOverlap ?? 200}
								onConfirm={(value) => updateChunking('chunkOverlap', value)}
								min={0}
								placeholder="200"
							/>
						</div>
					</div>
				</div>
			</div>
		</div>
	);
}

