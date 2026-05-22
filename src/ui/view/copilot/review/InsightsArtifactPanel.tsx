import React, { useMemo, useState } from 'react';
import { AlertTriangle, Lightbulb, MessageSquare, Save, Sparkles } from 'lucide-react';
import { Button } from '@/ui/component/shared-ui/button';
import { cn } from '@/ui/react/lib/utils';
import { StreamdownIsolated } from '@/ui/component/mine';
import type { InsightArtifact } from '@/service/copilot/CopilotRunArtifacts';
import { InsightInlineChat, type ChatTurn, type InsightChatMode } from './InsightInlineChat';
import {
	buildInsightSectionTrees,
	insightAnchorId,
	insightSectionAnchorId,
} from './insightSections';

function severityClass(severity: InsightArtifact['severity']): string {
	if (severity === 'high') return 'pktw-border-red-300 pktw-bg-red-50/60 dark:pktw-bg-red-950/20';
	if (severity === 'medium') return 'pktw-border-amber-300 pktw-bg-amber-50/60 dark:pktw-bg-amber-950/20';
	if (severity === 'low') return 'pktw-border-blue-300 pktw-bg-blue-50/60 dark:pktw-bg-blue-950/20';
	return 'pktw-border-border pktw-bg-muted/30 dark:pktw-bg-muted/15';
}

function ActionIcon({ kind }: { kind: NonNullable<InsightArtifact['actions']>[number]['kind'] }) {
	if (kind === 'ask-follow-up') return <MessageSquare className="pktw-h-3.5 pktw-w-3.5" />;
	if (kind === 'save-to-note') return <Save className="pktw-h-3.5 pktw-w-3.5" />;
	if (kind === 'create-proposal') return <Sparkles className="pktw-h-3.5 pktw-w-3.5" />;
	return <Lightbulb className="pktw-h-3.5 pktw-w-3.5" />;
}

export type InsightChatHistoryKey = `${string}::${InsightChatMode}`;
export function makeChatKey(insightId: string, mode: InsightChatMode): InsightChatHistoryKey {
	return `${insightId}::${mode}`;
}
export function parseChatKey(key: InsightChatHistoryKey): { insightId: string; mode: InsightChatMode } | null {
	const idx = key.lastIndexOf('::');
	if (idx < 0) return null;
	const mode = key.slice(idx + 2) as InsightChatMode;
	if (mode !== 'follow-up' && mode !== 'draft-proposal') return null;
	return { insightId: key.slice(0, idx), mode };
}

export const InsightsArtifactPanel: React.FC<{
	insights: InsightArtifact[];
	chatFollowups?: Array<{ id: string; question: string; rationale: string }>;
	subjectPath?: string;
	subjectBasename?: string;
	/** Persisted chat histories — key is `${insightId}::${mode}`. */
	chatHistories?: Record<InsightChatHistoryKey, ChatTurn[]>;
	onChatHistoryChange?: (key: InsightChatHistoryKey, turns: ChatTurn[]) => void;
	readOnly?: boolean;
}> = ({ insights, chatFollowups, subjectPath, subjectBasename, chatHistories, onChatHistoryChange, readOnly }) => {
	const hasFollowups = (chatFollowups?.length ?? 0) > 0;
	// Map insight.id → active chat mode (only one chat open per insight; closing clears it).
	const [openChats, setOpenChats] = useState<Map<string, InsightChatMode>>(new Map());

	const setChatForInsight = (insightId: string, mode: InsightChatMode | null) => {
		setOpenChats(prev => {
			const next = new Map(prev);
			if (mode === null) next.delete(insightId);
			else next.set(insightId, mode);
			return next;
		});
	};

	const getHistory = (insightId: string, mode: InsightChatMode): ChatTurn[] =>
		chatHistories?.[makeChatKey(insightId, mode)] ?? [];

	if (insights.length === 0 && !hasFollowups) {
		return (
			<div className="pktw-flex pktw-h-full pktw-items-center pktw-justify-center pktw-text-sm pktw-text-muted-foreground">
				No insights were produced yet.
			</div>
		);
	}

	const sectionTrees = buildInsightSectionTrees(insights);
	const treesById = new Map(sectionTrees.map(t => [t.insightId, t]));

	return (
		<div
			className="pktw-flex pktw-flex-col pktw-gap-4 pktw-p-4 pktw-max-w-4xl pktw-mx-auto pktw-w-full"
			style={{ userSelect: 'text' }}
		>
			{insights.map(insight => {
				const activeMode = openChats.get(insight.id) ?? null;
				const tree = treesById.get(insight.id);
				return (
					<div
						key={insight.id}
						id={insightAnchorId(insight.id)}
						className={cn(
							'pktw-rounded-lg pktw-border pktw-p-4 pktw-scroll-mt-4 pktw-shadow-sm',
							severityClass(insight.severity),
						)}
						style={{ userSelect: 'text' }}
					>
						<div className="pktw-flex pktw-items-start pktw-gap-2">
							<AlertTriangle className="pktw-mt-1 pktw-h-4 pktw-w-4 pktw-text-pk-accent pktw-shrink-0" />
							<span className="pktw-text-base pktw-font-semibold pktw-text-foreground" style={{ userSelect: 'text' }}>
								{insight.title}
							</span>
						</div>

						<div className="pktw-mt-2 pktw-pl-6" style={{ userSelect: 'text' }}>
							{tree && (tree.preamble || tree.sections.length > 0) ? (
								<>
									{tree.preamble && (
										<StreamdownIsolated className="pktw-text-sm pktw-leading-relaxed pktw-text-foreground">
											{tree.preamble.chunk}
										</StreamdownIsolated>
									)}
									{tree.sections.map(section => (
										<div
											key={section.slug}
											id={insightSectionAnchorId(insight.id, section.slug)}
											className="pktw-scroll-mt-4"
										>
											<StreamdownIsolated className="pktw-text-sm pktw-leading-relaxed pktw-text-foreground">
												{section.chunk}
											</StreamdownIsolated>
										</div>
									))}
								</>
							) : (
								<StreamdownIsolated className="pktw-text-sm pktw-leading-relaxed pktw-text-foreground">
									{insight.body}
								</StreamdownIsolated>
							)}
						</div>

						{insight.provenance.length > 0 && (
							<div className="pktw-mt-3 pktw-flex pktw-flex-wrap pktw-gap-1.5 pktw-pl-6">
								{insight.provenance.map(source => (
									<span
										key={`${insight.id}-${source.capabilityId}-${source.sourcePath ?? source.label}`}
										className="pktw-rounded-full pktw-bg-muted pktw-px-2 pktw-py-0.5 pktw-text-[10px] pktw-text-muted-foreground"
									>
										{source.label}
									</span>
								))}
							</div>
						)}

						{insight.actions && insight.actions.length > 0 && (
							<div className="pktw-mt-3 pktw-flex pktw-flex-wrap pktw-gap-2 pktw-pl-6">
								{insight.actions.map(action => {
									if (action.kind === 'ask-follow-up') {
										const isActive = activeMode === 'follow-up';
										const turns = getHistory(insight.id, 'follow-up').length;
										return (
											<Button
												key={action.id}
												variant={isActive ? 'secondary' : 'ghost'}
												size="sm"
												className="pktw-h-7 pktw-gap-1.5 pktw-text-xs"
												onClick={() => setChatForInsight(insight.id, isActive ? null : 'follow-up')}
											>
												<ActionIcon kind={action.kind} />
												{action.label}
												{turns > 0 && (
													<span className="pktw-ml-1 pktw-rounded-full pktw-bg-pk-accent/15 pktw-px-1.5 pktw-text-[10px] pktw-text-pk-accent">
														{Math.floor(turns / 2) || 1}
													</span>
												)}
											</Button>
										);
									}
									if (action.kind === 'create-proposal') {
										const isActive = activeMode === 'draft-proposal';
										const turns = getHistory(insight.id, 'draft-proposal').length;
										return (
											<Button
												key={action.id}
												variant={isActive ? 'secondary' : 'outline'}
												size="sm"
												className="pktw-h-7 pktw-gap-1.5 pktw-text-xs"
												onClick={() => setChatForInsight(insight.id, isActive ? null : 'draft-proposal')}
											>
												<ActionIcon kind={action.kind} />
												{action.label}
												{turns > 0 && (
													<span className="pktw-ml-1 pktw-rounded-full pktw-bg-pk-accent/15 pktw-px-1.5 pktw-text-[10px] pktw-text-pk-accent">
														{Math.floor(turns / 2) || 1}
													</span>
												)}
											</Button>
										);
									}
									return (
										<Button
											key={action.id}
											variant="ghost"
											size="sm"
											className="pktw-h-7 pktw-gap-1.5 pktw-text-xs"
											disabled
										>
											<ActionIcon kind={action.kind} />
											{action.label}
										</Button>
									);
								})}
							</div>
						)}

						{activeMode && (
							<div className="pktw-pl-6">
								<InsightInlineChat
									key={`${insight.id}-${activeMode}`}
									insightTitle={insight.title}
									insightBody={insight.body}
									subjectPath={subjectPath}
									subjectBasename={subjectBasename}
									mode={activeMode}
									initialHistory={getHistory(insight.id, activeMode)}
									onHistoryChange={turns => onChatHistoryChange?.(makeChatKey(insight.id, activeMode), turns)}
									onClose={() => setChatForInsight(insight.id, null)}
									readOnly={readOnly}
								/>
							</div>
						)}
					</div>
				);
			})}

			{hasFollowups && (
				<div id="peak-insight-followups" className="pktw-scroll-mt-4 pktw-rounded-lg pktw-border pktw-border-pk-accent/30 pktw-bg-pk-highlight/20 pktw-p-4" style={{ userSelect: 'text' }}>
					<div className="pktw-flex pktw-items-center pktw-gap-2">
						<MessageSquare className="pktw-h-4 pktw-w-4 pktw-text-pk-accent" />
						<span className="pktw-text-sm pktw-font-semibold pktw-text-foreground">Suggested follow-ups</span>
					</div>
					<div className="pktw-mt-2 pktw-flex pktw-flex-col pktw-gap-2 pktw-pl-6">
						{chatFollowups!.map(f => (
							<div key={f.id} className="pktw-flex pktw-flex-col pktw-gap-0.5">
								<span className="pktw-text-sm pktw-font-medium pktw-text-foreground">{f.question}</span>
								{f.rationale && (
									<span className="pktw-text-[11px] pktw-text-muted-foreground">{f.rationale}</span>
								)}
							</div>
						))}
					</div>
				</div>
			)}
		</div>
	);
};
