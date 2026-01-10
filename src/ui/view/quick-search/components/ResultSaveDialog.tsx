import React, { useState } from 'react';
import { X, FolderOpen, Sparkles, Check } from 'lucide-react';
import { Button } from '@/ui/component/shared-ui/button';
import { IconButton } from '@/ui/component/shared-ui/icon-button';
import { Input } from '@/ui/component/shared-ui/input';
import { useServiceContext } from '@/ui/context/ServiceContext';
import type { AiAnalyzeResult } from '@/service/search/types';
import { saveAiAnalyzeResultToMarkdown } from '@/ui/view/quick-search/features/save-ai-analyze-to-md';

interface SaveDialogProps {
	onClose: () => void;
	query: string;
	result: Pick<AiAnalyzeResult, 'summary' | 'sources' | 'insights' | 'usage'>;
	webEnabled?: boolean;
}

/**
 * Mock save dialog for AI search results.
 */
export const SaveDialog: React.FC<SaveDialogProps> = ({ onClose, query, result, webEnabled }) => {
	const today = new Date().toISOString().slice(0, 10);
	const defaultName = `AI Search Results - ${query.slice(0, 40) || 'Query'} - ${today}`;
	const [fileName, setFileName] = useState(defaultName);
	const [folderPath, setFolderPath] = useState('Analysis/AI Searches');
	const [isSaving, setIsSaving] = useState(false);
	const [saved, setSaved] = useState(false);
	const { app } = useServiceContext();

	const handleSave = async () => {
		if (isSaving || saved) return;
		setIsSaving(true);
		try {
			await saveAiAnalyzeResultToMarkdown(app, {
				folderPath,
				fileName,
				query,
				result,
				webEnabled,
			});
			setIsSaving(false);
			setSaved(true);
			setTimeout(onClose, 900);
		} catch (e) {
			console.error('Save failed:', e);
			setIsSaving(false);
		}
	};

	return (
		<div className="pktw-fixed pktw-inset-0 pktw-bg-black/20 pktw-flex pktw-items-center pktw-justify-center pktw-z-50 pktw-p-4">
			<div className="pktw-bg-white pktw-rounded-lg pktw-shadow-2xl pktw-border pktw-border-border pktw-w-full pktw-max-w-lg">
				{/* Header */}
				<div className="pktw-flex pktw-items-center pktw-justify-between pktw-px-5 pktw-py-4 pktw-border-b pktw-border-border">
					<div className="pktw-flex pktw-items-center pktw-gap-2">
						<Sparkles className="pktw-w-4 pktw-h-4 pktw-text-primary" />
						<span className="pktw-font-semibold pktw-text-foreground">Save Analysis Results</span>
					</div>
					<IconButton
						onClick={onClose}
						className="pktw-text-muted-foreground hover:pktw-text-foreground pktw-transition-colors"
						size="lg"
					>
						<X />
					</IconButton>
				</div>

				{/* Body */}
				<div className="pktw-px-5 pktw-space-y-4">
					{/* File Name */}
					<div>
						<label className="pktw-block pktw-text-sm pktw-font-medium pktw-text-foreground pktw-mb-2">
							File Name
							<span className="pktw-text-xs pktw-text-muted-foreground pktw-ml-2 pktw-font-normal">
								(AI suggested)
							</span>
						</label>
						<Input
							type="text"
							value={fileName}
							onChange={(e) => setFileName(e.target.value)}
							className="pktw-box-border pktw-transition-all"
						/>
						<span className="pktw-text-xs pktw-text-muted-foreground pktw-mt-1 pktw-block">
							Extension .md will be added automatically
						</span>
					</div>

					{/* Folder Path */}
					<div>
						<label className="pktw-block pktw-text-sm pktw-font-medium pktw-text-foreground pktw-mb-2">
							Save Location
							<span className="pktw-text-xs pktw-text-muted-foreground pktw-ml-2 pktw-font-normal">
								(AI suggested)
							</span>
						</label>
						<div className="pktw-relative">
							<FolderOpen className="pktw-absolute pktw-left-3 pktw-top-1/2 -pktw-translate-y-1/2 pktw-w-4 pktw-h-4 pktw-text-muted-foreground" />
							<Input
								type="text"
								value={folderPath}
								onChange={(e) => setFolderPath(e.target.value)}
								className="pktw-pl-10 pktw-box-border pktw-transition-all"
							/>
						</div>
						<span className="pktw-text-xs pktw-text-muted-foreground pktw-mt-1 pktw-block">
							Folder will be created if it does not exist
						</span>
					</div>

					{/* Preview */}
					<div className="pktw-bg-violet-50 pktw-border pktw-border-violet-200 pktw-rounded-md pktw-p-3">
						<span className="pktw-text-xs pktw-text-muted-foreground pktw-mb-1 pktw-block">Full path:</span>
						<span className="pktw-text-sm pktw-text-foreground pktw-font-mono pktw-block">
							{folderPath}/{fileName}.md
						</span>
					</div>

					{/* What will be saved */}
					<div className="pktw-text-xs pktw-text-muted-foreground pktw-space-y-1">
						<span className="pktw-font-medium pktw-block">Content to be saved:</span>
						<ul className="pktw-list-disc pktw-list-inside pktw-space-y-0.5">
							<li>AI Analysis Summary</li>
							<li>Top 5 Source Files with links</li>
							<li>Knowledge Graph visualization (Mermaid)</li>
							<li>Key Topics list</li>
							<li>Search metadata (query, date, token count)</li>
						</ul>
					</div>
				</div>

				{/* Footer */}
				<div className="pktw-flex pktw-items-center pktw-justify-end pktw-px-5 pktw-py-4 pktw-border-t pktw-border-border">
					<Button
						onClick={handleSave}
						disabled={isSaving || saved}
						className="pktw-px-5 pktw-py-2 pktw-text-sm pktw-min-w-[120px]"
					>
						{saved ? (
							<>
								<Check className="pktw-w-4 pktw-h-4" />
								Saved!
							</>
						) : isSaving ? (
							<>
								<Sparkles className="pktw-w-4 pktw-h-4 pktw-animate-pulse" />
								Saving...
							</>
						) : (
							<>Save File</>
						)}
					</Button>
				</div>
			</div>
		</div>
	);
};


