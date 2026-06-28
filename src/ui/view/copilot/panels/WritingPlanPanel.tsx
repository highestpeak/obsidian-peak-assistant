import React from 'react';
import { Notice, normalizePath } from 'obsidian';
import { useServiceContext } from '@/ui/context/ServiceContext';
import { useCopilotPanelVault } from '@/ui/view/copilot/hooks/useCopilotPanelVault';
import type { DocumentContext } from '@/service/copilot/CopilotActionRegistry';
import { FileText, AlertTriangle, Copy, Save, ExternalLink } from 'lucide-react';
import { CopilotPanelShell } from '@/ui/view/copilot/components/CopilotPanelShell';

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

const SectionLabel: React.FC<{ children: React.ReactNode }> = ({ children }) => (
	<span className="pktw-text-[10px] pktw-uppercase pktw-tracking-wider pktw-text-muted-foreground pktw-font-semibold pktw-block pktw-mb-2">
		{children}
	</span>
);

function planToMarkdown(result: WritingPlanResult, includeWordEstimate: boolean): string {
	const lines: string[] = [`# ${result.title}`, '', result.summary, '', '## Outline', ''];
	for (const section of result.outline) {
		lines.push(includeWordEstimate
			? `### ${section.section} (~${section.estimatedWords} words)`
			: `### ${section.section}`);
		if (!includeWordEstimate) {
			lines.push(`> Estimated: ~${section.estimatedWords} words`, '');
		}
		for (const point of section.keyPoints) lines.push(`- ${point}`);
		if (section.existingSources.length > 0) {
			if (!includeWordEstimate) lines.push('');
			lines.push(`${includeWordEstimate ? '- Sources: ' : 'Sources: '}${section.existingSources.map((s) => `[[${s}]]`).join(', ')}`);
		}
		lines.push('');
	}
	if (result.researchGaps.length > 0) {
		lines.push('## Research Gaps', '');
		for (const gap of result.researchGaps) {
			lines.push(`- **[${gap.priority}]** ${gap.topic}: ${gap.description}`);
		}
		if (includeWordEstimate) lines.push('');
	}
	return lines.join('\n');
}

export const WritingPlanPanel: React.FC<WritingPlanPanelProps> = ({ result, onClose }) => {
	const { vault } = useCopilotPanelVault();
	const { settings } = useServiceContext();

	const openNote = (path: string): Promise<void> => vault.openNote(path, { newLeaf: false });
	const totalWords = result.outline.reduce((sum, s) => sum + s.estimatedWords, 0);

	const handleCopy = async () => {
		await navigator.clipboard.writeText(planToMarkdown(result, true));
		new Notice('Writing plan copied to clipboard.');
	};

	const handleSaveAsNote = async () => {
		const inboxFolder = (settings as { inboxFolder?: string }).inboxFolder ?? '_inbox';
		const safeName = result.title.replace(/[\\/:*?"<>|]/g, '-');
		try {
			const filePath = await vault.createNoteInFolder(normalizePath(inboxFolder), safeName, planToMarkdown(result, false));
			new Notice(`Writing plan saved to ${filePath}`);
		} catch (e) {
			new Notice(`Failed to save: ${(e as Error).message}`);
		}
	};

	return (
		<CopilotPanelShell
			icon={FileText}
			title="Writing Plan"
			badge={`~${totalWords} words`}
			footerSummary={`${result.outline.length} sections, ${result.researchGaps.length} gaps`}
			onClose={onClose}
			actions={[
				{ label: 'Copy', icon: Copy, variant: 'ghost', onClick: handleCopy },
				{ label: 'Save as Note', icon: Save, onClick: handleSaveAsNote },
			]}
		>
			<div className="pktw-mb-4">
				<span className="pktw-text-base pktw-font-bold pktw-block">{result.title}</span>
				<span className="pktw-text-[12px] pktw-text-muted-foreground pktw-block pktw-mt-1 pktw-leading-relaxed">{result.summary}</span>
			</div>

			<div className="pktw-mb-4">
				<SectionLabel>Outline</SectionLabel>
				{result.outline.map((section, i) => (
					<div key={i} className="pktw-border pktw-border-border pktw-rounded-lg pktw-mb-2 pktw-overflow-hidden">
						<div className="pktw-flex pktw-items-center pktw-justify-between pktw-px-3 pktw-py-2 pktw-bg-secondary">
							<span className="pktw-text-[12px] pktw-font-semibold">{section.section}</span>
							<span className="pktw-text-[9px] pktw-text-muted-foreground pktw-font-mono">~{section.estimatedWords}w</span>
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

			{result.researchGaps.length > 0 && (
				<div className="pktw-mb-4">
					<SectionLabel>Research Gaps</SectionLabel>
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
								<span className="pktw-text-[11px] pktw-text-muted-foreground pktw-block pktw-mt-0.5">{gap.description}</span>
							</div>
						</div>
					))}
				</div>
			)}

			{result.suggestedSources.length > 0 && (
				<div>
					<SectionLabel>Suggested Sources</SectionLabel>
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
		</CopilotPanelShell>
	);
};
