import React from 'react';
import { Notice, normalizePath } from 'obsidian';
import { Button } from '@/ui/component/shared-ui/button';
import { AppContext } from '@/app/context/AppContext';
import type { DocumentContext } from '@/service/copilot/CopilotActionRegistry';
import { FileText, AlertTriangle, Copy, Save, ExternalLink } from 'lucide-react';

export interface WritingPlanOutlineSection {
	section: string;
	keyPoints: string[];
	estimatedWords: number;
	existingSources: string[];
}

export interface WritingPlanResearchGap {
	topic: string;
	description: string;
	priority: 'high' | 'medium' | 'low';
}

export interface WritingPlanSource {
	path: string;
	title: string;
	relevance: string;
}

export interface WritingPlanResult {
	title: string;
	outline: WritingPlanOutlineSection[];
	researchGaps: WritingPlanResearchGap[];
	suggestedSources: WritingPlanSource[];
	summary: string;
}

interface WritingPlanPanelProps {
	result: WritingPlanResult;
	ctx: DocumentContext;
	onClose: () => void;
}

const PRIORITY_STYLES: Record<string, string> = {
	high: 'pktw-bg-red-500/10 pktw-text-red-400',
	medium: 'pktw-bg-yellow-500/10 pktw-text-yellow-500',
	low: 'pktw-bg-blue-500/10 pktw-text-blue-400',
};

export const WritingPlanPanel: React.FC<WritingPlanPanelProps> = ({
	result, ctx, onClose,
}) => {
	const openNote = async (path: string) => {
		const app = AppContext.getInstance().app;
		const file = app.vault.getAbstractFileByPath(path);
		if (file && 'extension' in file) {
			await app.workspace.getLeaf(false).openFile(file as any);
		}
	};

	const totalWords = result.outline.reduce((sum, s) => sum + s.estimatedWords, 0);

	const handleCopy = async () => {
		const lines: string[] = [
			`# ${result.title}`,
			'',
			result.summary,
			'',
			'## Outline',
			'',
		];
		for (const section of result.outline) {
			lines.push(`### ${section.section} (~${section.estimatedWords} words)`);
			for (const point of section.keyPoints) {
				lines.push(`- ${point}`);
			}
			if (section.existingSources.length > 0) {
				lines.push(`- Sources: ${section.existingSources.map(s => `[[${s}]]`).join(', ')}`);
			}
			lines.push('');
		}
		if (result.researchGaps.length > 0) {
			lines.push('## Research Gaps');
			lines.push('');
			for (const gap of result.researchGaps) {
				lines.push(`- **[${gap.priority}]** ${gap.topic}: ${gap.description}`);
			}
			lines.push('');
		}
		await navigator.clipboard.writeText(lines.join('\n'));
		new Notice('Writing plan copied to clipboard.');
	};

	const handleSaveAsNote = async () => {
		const app = AppContext.getInstance().app;
		const settings = AppContext.getInstance().settings;
		const inboxFolder = (settings as any).inboxFolder ?? '_inbox';
		const safeName = result.title.replace(/[\\/:*?"<>|]/g, '-');
		const filePath = normalizePath(`${inboxFolder}/${safeName}.md`);

		const lines: string[] = [
			`# ${result.title}`,
			'',
			result.summary,
			'',
			'## Outline',
			'',
		];
		for (const section of result.outline) {
			lines.push(`### ${section.section}`);
			lines.push(`> Estimated: ~${section.estimatedWords} words`);
			lines.push('');
			for (const point of section.keyPoints) {
				lines.push(`- ${point}`);
			}
			if (section.existingSources.length > 0) {
				lines.push('');
				lines.push(`Sources: ${section.existingSources.map(s => `[[${s}]]`).join(', ')}`);
			}
			lines.push('');
		}
		if (result.researchGaps.length > 0) {
			lines.push('## Research Gaps');
			lines.push('');
			for (const gap of result.researchGaps) {
				lines.push(`- **[${gap.priority}]** ${gap.topic}: ${gap.description}`);
			}
		}

		try {
			const folderPath = normalizePath(inboxFolder);
			if (!(await app.vault.adapter.exists(folderPath))) {
				await app.vault.createFolder(folderPath);
			}
			await app.vault.create(filePath, lines.join('\n'));
			new Notice(`Writing plan saved to ${filePath}`);
		} catch (e) {
			new Notice(`Failed to save: ${(e as Error).message}`);
		}
	};

	return (
		<div className="pktw-flex pktw-flex-col pktw-h-full">
			{/* Header */}
			<div className="pktw-flex pktw-items-center pktw-justify-between pktw-px-5 pktw-py-3 pktw-border-b pktw-border-border">
				<div className="pktw-flex pktw-items-center pktw-gap-2">
					<FileText className="pktw-w-4 pktw-h-4" />
					<span className="pktw-text-sm pktw-font-semibold">Writing Plan</span>
					<span className="pktw-text-[9px] pktw-font-semibold pktw-px-2 pktw-py-0.5 pktw-rounded pktw-bg-accent/10 pktw-text-accent pktw-uppercase pktw-tracking-wider">
						~{totalWords} words
					</span>
				</div>
			</div>

			{/* Body */}
			<div className="pktw-flex-1 pktw-overflow-y-auto pktw-p-5">
				{/* Title + Summary */}
				<div className="pktw-mb-4">
					<span className="pktw-text-base pktw-font-bold pktw-block">{result.title}</span>
					<span className="pktw-text-[12px] pktw-text-muted-foreground pktw-block pktw-mt-1 pktw-leading-relaxed">
						{result.summary}
					</span>
				</div>

				{/* Outline */}
				<div className="pktw-mb-4">
					<span className="pktw-text-[10px] pktw-uppercase pktw-tracking-wider pktw-text-muted-foreground pktw-font-semibold pktw-block pktw-mb-2">
						Outline
					</span>
					{result.outline.map((section, i) => (
						<div key={i} className="pktw-border pktw-border-border pktw-rounded-lg pktw-mb-2 pktw-overflow-hidden">
							<div className="pktw-flex pktw-items-center pktw-justify-between pktw-px-3 pktw-py-2 pktw-bg-secondary">
								<span className="pktw-text-[12px] pktw-font-semibold">{section.section}</span>
								<span className="pktw-text-[9px] pktw-text-muted-foreground pktw-font-mono">
									~{section.estimatedWords}w
								</span>
							</div>
							<div className="pktw-px-3 pktw-py-2">
								{section.keyPoints.map((point, j) => (
									<div key={j} className="pktw-flex pktw-items-start pktw-gap-1.5 pktw-py-0.5">
										<span className="pktw-text-muted-foreground pktw-text-[10px] pktw-mt-0.5">-</span>
										<span className="pktw-text-[11px]">{point}</span>
									</div>
								))}
								{section.existingSources.length > 0 && (
									<div className="pktw-flex pktw-flex-wrap pktw-gap-1 pktw-mt-1.5 pktw-pt-1.5 pktw-border-t pktw-border-border">
										{section.existingSources.map((src, j) => (
											<span
												key={j}
												className="pktw-text-[9px] pktw-px-1.5 pktw-py-0.5 pktw-rounded pktw-bg-accent/10 pktw-text-accent pktw-cursor-pointer hover:pktw-underline"
												onClick={() => openNote(src)}
											>
												{src.replace(/\.md$/, '').split('/').pop()}
											</span>
										))}
									</div>
								)}
							</div>
						</div>
					))}
				</div>

				{/* Research Gaps */}
				{result.researchGaps.length > 0 && (
					<div className="pktw-mb-4">
						<span className="pktw-text-[10px] pktw-uppercase pktw-tracking-wider pktw-text-muted-foreground pktw-font-semibold pktw-block pktw-mb-2">
							Research Gaps
						</span>
						{result.researchGaps.map((gap, i) => (
							<div key={i} className="pktw-flex pktw-items-start pktw-gap-2 pktw-px-3 pktw-py-2 pktw-rounded-lg pktw-border pktw-border-border pktw-mb-1.5">
								<AlertTriangle className="pktw-w-3 pktw-h-3 pktw-flex-shrink-0 pktw-mt-0.5 pktw-text-muted-foreground" />
								<div className="pktw-flex-1 pktw-min-w-0">
									<div className="pktw-flex pktw-items-center pktw-gap-1.5">
										<span className="pktw-text-[12px] pktw-font-semibold">{gap.topic}</span>
										<span className={`pktw-text-[8px] pktw-font-bold pktw-px-1.5 pktw-py-0.5 pktw-rounded pktw-uppercase ${PRIORITY_STYLES[gap.priority] ?? ''}`}>
											{gap.priority}
										</span>
									</div>
									<span className="pktw-text-[11px] pktw-text-muted-foreground pktw-block pktw-mt-0.5">
										{gap.description}
									</span>
								</div>
							</div>
						))}
					</div>
				)}

				{/* Suggested Sources */}
				{result.suggestedSources.length > 0 && (
					<div>
						<span className="pktw-text-[10px] pktw-uppercase pktw-tracking-wider pktw-text-muted-foreground pktw-font-semibold pktw-block pktw-mb-2">
							Suggested Sources
						</span>
						{result.suggestedSources.map((src, i) => (
							<div
								key={i}
								className="pktw-flex pktw-items-start pktw-gap-2 pktw-px-3 pktw-py-2 pktw-rounded-lg pktw-cursor-pointer hover:pktw-bg-muted pktw-transition-colors pktw-group"
								onClick={() => openNote(src.path)}
							>
								<FileText className="pktw-w-3 pktw-h-3 pktw-text-muted-foreground pktw-flex-shrink-0 pktw-mt-0.5" />
								<div className="pktw-flex-1 pktw-min-w-0">
									<div className="pktw-flex pktw-items-center pktw-gap-1.5">
										<span className="pktw-text-[12px] pktw-font-semibold pktw-text-accent">{src.title}</span>
										<ExternalLink className="pktw-w-3 pktw-h-3 pktw-text-muted-foreground pktw-opacity-0 group-hover:pktw-opacity-100 pktw-transition-opacity" />
									</div>
									<span className="pktw-text-[10px] pktw-text-muted-foreground pktw-block pktw-mt-0.5">{src.relevance}</span>
								</div>
							</div>
						))}
					</div>
				)}
			</div>

			{/* Footer */}
			<div className="pktw-flex pktw-items-center pktw-justify-end pktw-gap-2 pktw-px-5 pktw-py-3 pktw-border-t pktw-border-border pktw-bg-secondary">
				<span className="pktw-text-[11px] pktw-text-muted-foreground pktw-mr-auto">
					{result.outline.length} sections, {result.researchGaps.length} gaps
				</span>
				<Button variant="ghost" onClick={onClose}>Dismiss</Button>
				<Button variant="ghost" onClick={handleCopy}>
					<Copy className="pktw-w-3.5 pktw-h-3.5 pktw-mr-1.5" />
					Copy
				</Button>
				<Button onClick={handleSaveAsNote}>
					<Save className="pktw-w-3.5 pktw-h-3.5 pktw-mr-1.5" />
					Save as Note
				</Button>
			</div>
		</div>
	);
};
