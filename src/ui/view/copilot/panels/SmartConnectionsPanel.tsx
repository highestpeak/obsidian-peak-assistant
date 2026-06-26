import React, { useState } from 'react';
import { Notice } from 'obsidian';
import { Button } from '@/ui/component/shared-ui/button';
import { useCopilotPanelVault } from '@/ui/view/copilot/hooks/useCopilotPanelVault';
import type { DocumentContext } from '@/service/copilot/CopilotActionRegistry';
import { Zap, Check, ExternalLink } from 'lucide-react';

export interface SmartConnection {
	path: string;
	title: string;
	similarityScore: number;
	sharedThemes: string[];
	suggestedLinkText: string;
}

export interface SmartConnectionsResult {
	connections: SmartConnection[];
	summary: string;
}

interface SmartConnectionsPanelProps {
	result: SmartConnectionsResult;
	ctx: DocumentContext;
	onClose: () => void;
}

export const SmartConnectionsPanel: React.FC<SmartConnectionsPanelProps> = ({
	result, ctx, onClose,
}) => {
	const { vault } = useCopilotPanelVault();
	const [selected, setSelected] = useState<Set<number>>(() => new Set());
	const [insertedPaths, setInsertedPaths] = useState<Set<string>>(() => new Set());

	const toggle = (i: number) => {
		setSelected(prev => {
			const next = new Set(prev);
			if (next.has(i)) next.delete(i); else next.add(i);
			return next;
		});
	};

	const openNote = (path: string): Promise<void> =>
		vault.openNote(path, { newLeaf: false });

	const insertLinks = async () => {
		const selectedConnections = result.connections.filter((_, i) => selected.has(i));
		if (selectedConnections.length === 0) return;

		try {
			const content = await vault.readFileContent(ctx.file);
			const linkLines = selectedConnections.map(c => {
				const linkTarget = c.path.replace(/\.md$/, '');
				return `- [[${linkTarget}|${c.suggestedLinkText}]]`;
			});
			const linkSection = `\n\n## Smart Connections\n\n${linkLines.join('\n')}\n`;
			await vault.replaceFileContent(ctx.file, content + linkSection);

			const paths = new Set(selectedConnections.map(c => c.path));
			setInsertedPaths(prev => new Set([...prev, ...paths]));
			new Notice(`Inserted ${selectedConnections.length} link${selectedConnections.length !== 1 ? 's' : ''}.`);
		} catch (e) {
			new Notice(`Failed: ${(e as Error).message}`);
		}
	};

	const formatScore = (score: number) => {
		const pct = Math.round(score * 100);
		if (pct >= 80) return { label: `${pct}%`, className: 'pktw-text-[var(--pk-success)]' };
		if (pct >= 50) return { label: `${pct}%`, className: 'pktw-text-accent' };
		return { label: `${pct}%`, className: 'pktw-text-muted-foreground' };
	};

	return (
		<div className="pktw-flex pktw-flex-col pktw-h-full">
			{/* Header */}
			<div className="pktw-flex pktw-items-center pktw-justify-between pktw-px-5 pktw-py-3 pktw-border-b pktw-border-border">
				<div className="pktw-flex pktw-items-center pktw-gap-2">
					<Zap className="pktw-w-4 pktw-h-4" />
					<span className="pktw-text-sm pktw-font-semibold">Smart Connections</span>
					<span className="pktw-text-[9px] pktw-font-semibold pktw-px-2 pktw-py-0.5 pktw-rounded pktw-bg-accent/10 pktw-text-accent pktw-uppercase pktw-tracking-wider">
						{result.connections.length} found
					</span>
				</div>
			</div>

			{/* Summary */}
			<div className="pktw-px-5 pktw-py-2.5 pktw-border-b pktw-border-border pktw-bg-secondary">
				<span className="pktw-text-[11px] pktw-text-muted-foreground">
					{result.summary}
				</span>
			</div>

			{/* Body */}
			<div className="pktw-flex-1 pktw-overflow-y-auto pktw-p-5">
				{result.connections.length === 0 ? (
					<div className="pktw-text-center pktw-text-muted-foreground pktw-py-8 pktw-text-sm">
						No smart connections found for this note.
					</div>
				) : (
					result.connections.map((conn, i) => {
						const isChecked = selected.has(i);
						const isInserted = insertedPaths.has(conn.path);
						const scoreInfo = formatScore(conn.similarityScore);
						return (
							<div
								key={conn.path}
								className={`pktw-flex pktw-items-start pktw-gap-2.5 pktw-px-3 pktw-py-2.5 pktw-rounded-lg pktw-cursor-pointer hover:pktw-bg-muted pktw-transition-colors ${
									isInserted ? 'pktw-opacity-50' : ''
								}`}
								onClick={() => !isInserted && toggle(i)}
							>
								<div className={`pktw-w-4 pktw-h-4 pktw-rounded pktw-border-2 pktw-flex pktw-items-center pktw-justify-center pktw-flex-shrink-0 pktw-mt-0.5 pktw-transition-all ${
									isInserted
										? 'pktw-bg-[var(--pk-success)] pktw-border-[var(--pk-success)] pktw-text-white'
										: isChecked
											? 'pktw-bg-accent pktw-border-accent pktw-text-white pktw-text-[10px]'
											: 'pktw-border-border'
								}`}>
									{(isChecked || isInserted) && <Check className="pktw-w-2.5 pktw-h-2.5" />}
								</div>
								<div className="pktw-flex-1 pktw-min-w-0">
									<div className="pktw-flex pktw-items-center pktw-gap-1.5">
										<span className="pktw-text-[13px] pktw-font-semibold pktw-text-accent pktw-truncate">
											{conn.title}
										</span>
										<span className={`pktw-text-[10px] pktw-font-bold ${scoreInfo.className}`}>
											{scoreInfo.label}
										</span>
										<ExternalLink
											className="pktw-w-3 pktw-h-3 pktw-text-muted-foreground pktw-opacity-0 group-hover:pktw-opacity-100 pktw-flex-shrink-0 pktw-cursor-pointer"
											onClick={(e) => { e.stopPropagation(); openNote(conn.path); }}
										/>
									</div>
									{/* Shared themes */}
									{conn.sharedThemes.length > 0 && (
										<div className="pktw-flex pktw-flex-wrap pktw-gap-1 pktw-mt-1">
											{conn.sharedThemes.map(theme => (
												<span
													key={theme}
													className="pktw-text-[9px] pktw-px-1.5 pktw-py-0.5 pktw-rounded pktw-bg-muted pktw-text-muted-foreground pktw-border pktw-border-border"
												>
													{theme}
												</span>
											))}
										</div>
									)}
									<span className="pktw-text-[10px] pktw-text-muted-foreground/40 pktw-block pktw-mt-1 pktw-truncate">
										{conn.path}
									</span>
									{/* Suggested link text */}
									<span className="pktw-text-[10px] pktw-text-accent/70 pktw-block pktw-mt-0.5 pktw-italic">
										Link: [[{conn.suggestedLinkText}]]
									</span>
								</div>
							</div>
						);
					})
				)}
			</div>

			{/* Footer */}
			<div className="pktw-flex pktw-items-center pktw-justify-end pktw-gap-2 pktw-px-5 pktw-py-3 pktw-border-t pktw-border-border pktw-bg-secondary">
				<span className="pktw-text-[11px] pktw-text-muted-foreground pktw-mr-auto">
					{selected.size} of {result.connections.length} selected
				</span>
				<Button variant="ghost" onClick={onClose}>Dismiss</Button>
				<Button onClick={insertLinks} disabled={selected.size === 0}>
					Insert {selected.size} Link{selected.size !== 1 ? 's' : ''}
				</Button>
			</div>
		</div>
	);
};
