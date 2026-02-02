import React, { useCallback, useEffect, useRef, useState } from 'react';
import { X, Sparkles, Check, Save, Wand2 } from 'lucide-react';
import { Button } from '@/ui/component/shared-ui/button';
import { IconButton } from '@/ui/component/shared-ui/icon-button';
import { Input } from '@/ui/component/shared-ui/input';
import { useAIAnalysisResult } from '../../hooks/useAIAnalysisResult';
import { AppContext } from '@/app/context/AppContext';
import { useSharedStore } from '../../store/sharedStore';
import { useTypewriterEffect } from '@/ui/component/mine/useTypewriterEffect';
import { TYPEWRITER_EFFECT_SPEED_MS } from '@/core/constant';
import { useGenerateResultSaveField } from '../../hooks/useAIAnalysisPostAIInteractions';

export interface ResultSaveDialogProps {
	onClose: () => void;
}

interface AIGenerateInputFieldProps {
	label: string;
	value: string;
	onChange: (v: string) => void;
	onGenerate: (setTarget: (v: string) => void, setEnabled: (v: boolean) => void) => Promise<void>;
	onTypewriterActiveChange?: (active: boolean) => void;
	hintText: string;
}

/**
 * Input field with AI Analyze button. Manages typewriter, generating, aiSuggested internally.
 */
const AIGenerateInputField: React.FC<AIGenerateInputFieldProps> = ({
	label,
	value,
	onChange,
	onGenerate,
	onTypewriterActiveChange,
	hintText,
}) => {
	const [typewriterTarget, setTypewriterTarget] = useState('');
	const [typewriterEnabled, setTypewriterEnabled] = useState(false);
	const [aiSuggested, setAiSuggested] = useState(false);
	const [generating, setGenerating] = useState(false);

	const completeRef = useRef<() => void>(() => { });
	completeRef.current = () => {
		if (typewriterTarget) {
			onChange(typewriterTarget);
			setAiSuggested(true);
			setTypewriterEnabled(false);
			setTypewriterTarget('');
		}
	};
	const onComplete = useCallback(() => {
		completeRef.current();
	}, [onChange]);

	const display = useTypewriterEffect({
		text: typewriterTarget,
		speed: TYPEWRITER_EFFECT_SPEED_MS,
		enabled: typewriterEnabled && !!typewriterTarget,
		onComplete,
	});

	const displayValue = typewriterEnabled ? display : value;

	useEffect(() => {
		onTypewriterActiveChange?.(typewriterEnabled);
	}, [typewriterEnabled, onTypewriterActiveChange]);

	const handleGenerate = useCallback(async () => {
		if (generating) return;
		setGenerating(true);
		try {
			await onGenerate(setTypewriterTarget, setTypewriterEnabled);
		} catch (e) {
			console.error('Generate failed:', e);
		} finally {
			setGenerating(false);
		}
	}, [generating, onGenerate]);

	return (
		<div>
			<label className="pktw-block pktw-text-sm pktw-font-medium pktw-text-foreground pktw-mb-2">
				{label}
				{aiSuggested && (
					<span className="pktw-text-xs pktw-text-muted-foreground pktw-ml-2 pktw-font-normal">
						(AI suggested)
					</span>
				)}
			</label>
			<div className="pktw-relative pktw-flex pktw-items-center">
				<Input
					type="text"
					value={displayValue}
					onChange={(e) => !typewriterEnabled && onChange(e.target.value)}
					readOnly={typewriterEnabled}
					className="pktw-pr-14 pktw-box-border pktw-transition-all pktw-flex-1"
				/>
				<IconButton
					onClick={generating ? undefined : handleGenerate}
					className={`pktw-absolute pktw-right-2 pktw-top-1/2 -pktw-translate-y-1/2 pktw-p-1.5 pktw-rounded pktw-border-0 pktw-bg-transparent hover:pktw-bg-accent hover:pktw-text-accent-foreground pktw-transition-colors ${generating ? 'pktw-cursor-not-allowed pktw-opacity-60 pktw-pointer-events-none' : ''}`}
					title={`Generate ${label} with AI`}
				>
					<Wand2 className={`pktw-w-4 pktw-h-4 ${generating ? 'pktw-animate-pulse' : ''}`} />
				</IconButton>
			</div>
			<span className="pktw-text-xs pktw-text-muted-foreground pktw-mt-1 pktw-block">{hintText}</span>
		</div>
	);
};

/**
 * Result actions dialog: Copy All, Save to File, Open in Chat.
 * File name defaults to query; folder defaults to aiAnalysisAutoSaveFolder.
 * Use "Analyze" buttons to AI-generate suggestions.
 */
export const SaveDialog: React.FC<ResultSaveDialogProps> = ({ onClose }) => {
	const [saved, setSaved] = useState(false);
	const [fileName, setFileName] = useState<string>(useSharedStore().searchQuery.trim() || 'Query');
	const [folderPath, setFolderPath] = useState(
		AppContext.getInstance().settings.search.aiAnalysisAutoSaveFolder!
	);
	const [fileTypewriterActive, setFileTypewriterActive] = useState(false);
	const [folderTypewriterActive, setFolderTypewriterActive] = useState(false);

	const { generateFileName, generateFolder } = useGenerateResultSaveField();

	const { handleSaveToFile } = useAIAnalysisResult();
	const [isSaving, setIsSaving] = useState(false);
	const handleSave = useCallback(async () => {
		if (isSaving || saved) return;
		setIsSaving(true);
		try {
			await handleSaveToFile(folderPath, fileName);
			setIsSaving(false);
			setSaved(true);
			setTimeout(onClose, 900);
		} catch (e) {
			console.error('Save failed:', e);
			setIsSaving(false);
		}
	}, [handleSaveToFile, folderPath, fileName, isSaving, saved, onClose]);

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
					<AIGenerateInputField
						label="File Name"
						value={fileName}
						onChange={setFileName}
						onGenerate={generateFileName}
						onTypewriterActiveChange={setFileTypewriterActive}
						hintText="Extension .md will be added automatically"
					/>
					<AIGenerateInputField
						label="Save Location"
						value={folderPath}
						onChange={setFolderPath}
						onGenerate={generateFolder}
						onTypewriterActiveChange={setFolderTypewriterActive}
						hintText="Folder will be created if it does not exist"
					/>

					{/* Preview */}
					<div className="pktw-bg-violet-50 pktw-border pktw-border-violet-200 pktw-rounded-md pktw-p-3">
						<span className="pktw-text-xs pktw-text-muted-foreground pktw-mb-1 pktw-block">Full path:</span>
						<span className="pktw-text-sm pktw-text-foreground pktw-font-mono pktw-block">
							{folderPath ? `${folderPath}/` : ''}
							{fileName || 'untitled'}.md
						</span>
					</div>

					{/* What will be saved */}
					<div className="pktw-text-xs pktw-text-muted-foreground pktw-space-y-1">
						<span className="pktw-font-medium pktw-block">
							All content except the execution steps will be saved, including summaries, key topics, dashboard blocks, sources with links, the knowledge graph (Mermaid), and any available search metadata (such as query, date, or token count).
						</span>
					</div>
				</div>

				{/* Footer */}
				<div className="pktw-flex pktw-items-center pktw-justify-end pktw-px-5 pktw-py-4 pktw-border-t pktw-border-border">
					<Button
						onClick={handleSave}
						disabled={isSaving || saved || fileTypewriterActive || folderTypewriterActive}
						className="pktw-px-5 pktw-py-2 pktw-text-sm pktw-min-w-[120px] pktw-flex pktw-items-center pktw-gap-2"
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
							<>
								<Save className="pktw-w-4 pktw-h-4" />
								Save File
							</>
						)}
					</Button>
				</div>
			</div>
		</div>
	);
};
