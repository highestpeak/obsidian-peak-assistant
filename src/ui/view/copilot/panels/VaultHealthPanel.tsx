// src/ui/view/copilot/panels/VaultHealthPanel.tsx
import React, { useState } from 'react';
import { Button } from '@/ui/component/shared-ui/button';
import { AppContext } from '@/app/context/AppContext';
import type { VaultHealth } from '@/service/copilot/copilot-schemas';
import type { DocumentContext } from '@/service/copilot/CopilotActionRegistry';
import { Activity, FileQuestion, Copy, Clock, Tags } from 'lucide-react';

type TabId = 'orphans' | 'duplicates' | 'stale' | 'tags';

const TABS: Array<{ id: TabId; label: string; icon: React.FC<{ className?: string }> }> = [
	{ id: 'orphans', label: 'Orphans', icon: FileQuestion },
	{ id: 'duplicates', label: 'Duplicates', icon: Copy },
	{ id: 'stale', label: 'Stale', icon: Clock },
	{ id: 'tags', label: 'Tags', icon: Tags },
];

interface VaultHealthPanelProps {
	result: VaultHealth;
	ctx: DocumentContext;
	onClose: () => void;
}

export const VaultHealthPanel: React.FC<VaultHealthPanelProps> = ({
	result, ctx, onClose,
}) => {
	const [activeTab, setActiveTab] = useState<TabId>('orphans');

	const openNote = async (path: string) => {
		const app = AppContext.getInstance().app;
		const file = app.vault.getAbstractFileByPath(path);
		if (file && 'extension' in file) {
			await app.workspace.getLeaf(false).openFile(file as any);
		}
	};

	const counts: Record<TabId, number> = {
		orphans: result.orphans.length,
		duplicates: result.duplicates.length,
		stale: result.stale.length,
		tags: result.inconsistentTags.length,
	};

	const totalIssues = Object.values(counts).reduce((a, b) => a + b, 0);

	return (
		<div className="pktw-flex pktw-flex-col pktw-h-full">
			{/* Header */}
			<div className="pktw-flex pktw-items-center pktw-justify-between pktw-px-5 pktw-py-3 pktw-border-b pktw-border-border">
				<div className="pktw-flex pktw-items-center pktw-gap-2">
					<Activity className="pktw-w-4 pktw-h-4" />
					<span className="pktw-text-sm pktw-font-semibold">Vault Health</span>
					<span className="pktw-text-[9px] pktw-font-semibold pktw-px-2 pktw-py-0.5 pktw-rounded pktw-bg-accent/10 pktw-text-accent pktw-uppercase pktw-tracking-wider">
						{totalIssues} issues
					</span>
				</div>
			</div>

			{/* Tabs */}
			<div className="pktw-flex pktw-border-b pktw-border-border">
				{TABS.map(tab => {
					const isActive = activeTab === tab.id;
					const count = counts[tab.id];
					return (
						<div
							key={tab.id}
							className={`pktw-flex pktw-items-center pktw-gap-1.5 pktw-px-4 pktw-py-2 pktw-cursor-pointer pktw-text-[11px] pktw-font-semibold pktw-transition-colors pktw-border-b-2 ${
								isActive
									? 'pktw-border-accent pktw-text-accent'
									: 'pktw-border-transparent pktw-text-muted-foreground hover:pktw-text-foreground'
							}`}
							onClick={() => setActiveTab(tab.id)}
						>
							<tab.icon className="pktw-w-3.5 pktw-h-3.5" />
							{tab.label}
							{count > 0 && (
								<span className={`pktw-text-[8px] pktw-font-bold pktw-px-1 pktw-py-0.5 pktw-rounded pktw-min-w-[16px] pktw-text-center ${
									isActive ? 'pktw-bg-accent/10 pktw-text-accent' : 'pktw-bg-muted pktw-text-muted-foreground'
								}`}>
									{count}
								</span>
							)}
						</div>
					);
				})}
			</div>

			{/* Body */}
			<div className="pktw-flex-1 pktw-overflow-y-auto pktw-p-5">
				{activeTab === 'orphans' && (
					result.orphans.length === 0 ? (
						<div className="pktw-text-center pktw-text-muted-foreground pktw-py-8 pktw-text-sm">
							No orphan notes found.
						</div>
					) : (
						result.orphans.map((orphan, i) => (
							<div
								key={i}
								className="pktw-flex pktw-items-center pktw-gap-2.5 pktw-px-3 pktw-py-2 pktw-rounded-lg pktw-cursor-pointer hover:pktw-bg-muted pktw-transition-colors"
								onClick={() => openNote(orphan.path)}
							>
								<FileQuestion className="pktw-w-3.5 pktw-h-3.5 pktw-text-muted-foreground pktw-flex-shrink-0" />
								<div className="pktw-flex-1 pktw-min-w-0">
									<span className="pktw-text-[12px] pktw-font-semibold pktw-block pktw-truncate">{orphan.title}</span>
									<span className="pktw-text-[10px] pktw-text-muted-foreground/60 pktw-block pktw-truncate">{orphan.path}</span>
								</div>
								<span className="pktw-text-[10px] pktw-text-muted-foreground/40 pktw-flex-shrink-0">{orphan.lastModified}</span>
							</div>
						))
					)
				)}

				{activeTab === 'duplicates' && (
					result.duplicates.length === 0 ? (
						<div className="pktw-text-center pktw-text-muted-foreground pktw-py-8 pktw-text-sm">
							No duplicate notes detected.
						</div>
					) : (
						result.duplicates.map((dup, i) => (
							<div key={i} className="pktw-border pktw-border-border pktw-rounded-lg pktw-mb-2.5 pktw-overflow-hidden">
								<div className="pktw-px-3.5 pktw-py-2 pktw-bg-secondary pktw-border-b pktw-border-border">
									<div className="pktw-flex pktw-items-center pktw-gap-1.5">
										<Copy className="pktw-w-3 pktw-h-3 pktw-text-muted-foreground" />
										<span className="pktw-text-[11px] pktw-text-muted-foreground">{dup.reason}</span>
									</div>
								</div>
								<div className="pktw-px-3.5 pktw-py-2">
									{dup.paths.map((path, j) => (
										<div
											key={j}
											className="pktw-text-[12px] pktw-text-accent pktw-py-1 pktw-cursor-pointer hover:pktw-underline"
											onClick={() => openNote(path)}
										>
											{path}
										</div>
									))}
								</div>
							</div>
						))
					)
				)}

				{activeTab === 'stale' && (
					result.stale.length === 0 ? (
						<div className="pktw-text-center pktw-text-muted-foreground pktw-py-8 pktw-text-sm">
							No stale notes found.
						</div>
					) : (
						result.stale.map((item, i) => (
							<div
								key={i}
								className="pktw-flex pktw-items-center pktw-gap-2.5 pktw-px-3 pktw-py-2 pktw-rounded-lg pktw-cursor-pointer hover:pktw-bg-muted pktw-transition-colors"
								onClick={() => openNote(item.path)}
							>
								<Clock className="pktw-w-3.5 pktw-h-3.5 pktw-text-muted-foreground pktw-flex-shrink-0" />
								<div className="pktw-flex-1 pktw-min-w-0">
									<span className="pktw-text-[12px] pktw-font-semibold pktw-block pktw-truncate">{item.title}</span>
									<span className="pktw-text-[10px] pktw-text-muted-foreground/60 pktw-block pktw-truncate">{item.path}</span>
								</div>
								<span className="pktw-text-[10px] pktw-text-muted-foreground/40 pktw-flex-shrink-0">{item.daysSinceModified}d ago</span>
							</div>
						))
					)
				)}

				{activeTab === 'tags' && (
					result.inconsistentTags.length === 0 ? (
						<div className="pktw-text-center pktw-text-muted-foreground pktw-py-8 pktw-text-sm">
							No tag inconsistencies found.
						</div>
					) : (
						result.inconsistentTags.map((item, i) => (
							<div key={i} className="pktw-border pktw-border-border pktw-rounded-lg pktw-mb-2.5 pktw-overflow-hidden">
								<div className="pktw-px-3.5 pktw-py-2 pktw-bg-secondary pktw-border-b pktw-border-border">
									<div className="pktw-flex pktw-items-center pktw-gap-1.5">
										<Tags className="pktw-w-3 pktw-h-3 pktw-text-muted-foreground" />
										<span className="pktw-text-[12px] pktw-font-semibold">{item.tag}</span>
									</div>
								</div>
								<div className="pktw-px-3.5 pktw-py-2 pktw-flex pktw-flex-wrap pktw-gap-1.5">
									{item.variants.map((variant, j) => (
										<span
											key={j}
											className="pktw-text-[10px] pktw-px-2 pktw-py-0.5 pktw-rounded pktw-bg-muted pktw-text-muted-foreground pktw-border pktw-border-border"
										>
											{variant}
										</span>
									))}
								</div>
							</div>
						))
					)
				)}
			</div>

			{/* Footer */}
			<div className="pktw-flex pktw-items-center pktw-justify-end pktw-gap-2 pktw-px-5 pktw-py-3 pktw-border-t pktw-border-border pktw-bg-secondary">
				<span className="pktw-text-[11px] pktw-text-muted-foreground pktw-mr-auto">
					{totalIssues} total issues found
				</span>
				<Button variant="ghost" onClick={onClose}>Dismiss</Button>
			</div>
		</div>
	);
};
