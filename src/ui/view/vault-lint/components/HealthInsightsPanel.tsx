import React from 'react';
import { AlertCircle, AlertTriangle, Bot, Clipboard, ExternalLink, Info, SearchCheck, Wrench } from 'lucide-react';
import { Notice } from 'obsidian';
import { Button } from '@/ui/component/shared-ui/button';
import { useServiceContext } from '@/ui/context/ServiceContext';
import { useChatNavigation } from '@/ui/view/chat-view/useChatNavigation';
import { useChatViewStore } from '@/ui/view/chat-view/store/chatViewStore';
import type { VaultNavigationPort } from '@/service/navigation/VaultNavigationPort';
import type { ChatNavigationPort } from '@/service/chat/navigation/ChatNavigationPort';
import type { HealthInsight, HealthInsightAction, HealthInsightSeverity } from '@/service/lint/insights';

const SEVERITY_STYLE: Record<HealthInsightSeverity, { icon: React.ElementType; className: string; label: string }> = {
	critical: { icon: AlertCircle, className: 'pktw-text-red-500 pktw-bg-red-500/10', label: 'Critical' },
	warning: { icon: AlertTriangle, className: 'pktw-text-amber-500 pktw-bg-amber-500/10', label: 'Warning' },
	info: { icon: Info, className: 'pktw-text-blue-500 pktw-bg-blue-500/10', label: 'Info' },
};

interface HealthInsightsPanelProps {
	insights: HealthInsight[];
}

async function copyPrompt(prompt: string | undefined): Promise<void> {
	if (!prompt) return;
	await navigator.clipboard.writeText(prompt);
	new Notice('Repair prompt copied.');
}

async function openFile(path: string | null, vaultNavigation: VaultNavigationPort): Promise<void> {
	if (!path) return;
	const opened = await vaultNavigation.openVaultPath(path);
	if (!opened) {
		new Notice(`File not found: ${path}`);
	}
}

async function askAi(
	insight: HealthInsight,
	action: HealthInsightAction,
	chatNavigation: ChatNavigationPort,
): Promise<void> {
	if (!action.prompt) return;

	useChatViewStore.getState().setChatMode('agent');
	useChatViewStore.getState().setEnableVaultSearch(true);
	await chatNavigation.openPendingConversationInChat({
		title: insight.title,
		project: null,
	});

	requestAnimationFrame(() => {
		requestAnimationFrame(() => {
			const insertToInput = useChatViewStore.getState().insertToInput;
			if (insertToInput) {
				insertToInput(action.prompt!);
				new Notice('Repair prompt is ready in Chat.');
				return;
			}
			void copyPrompt(action.prompt);
		});
	});
}

const ActionButton: React.FC<{
	insight: HealthInsight;
	action: HealthInsightAction;
	vaultNavigation: VaultNavigationPort;
	chatNavigation: ChatNavigationPort;
}> = ({ insight, action, vaultNavigation, chatNavigation }) => {
	if (action.mode === 'ai') {
		return (
			<Button variant="default" size="sm" className="pktw-h-7 pktw-gap-1.5 pktw-text-[11px]"
				onClick={() => void askAi(insight, action, chatNavigation)}>
				<Bot className="pktw-w-3.5 pktw-h-3.5" />
				{action.label}
			</Button>
		);
	}

	return (
		<Button variant="outline" size="sm" className="pktw-h-7 pktw-gap-1.5 pktw-text-[11px]"
			onClick={() => void openFile(insight.evidence[0]?.filePath ?? null, vaultNavigation)}>
			<Wrench className="pktw-w-3.5 pktw-h-3.5" />
			{action.label}
		</Button>
	);
};

export const HealthInsightsPanel: React.FC<HealthInsightsPanelProps> = ({ insights }) => {
	const { vaultNavigation } = useServiceContext();
	const chatNavigation = useChatNavigation();
	if (insights.length === 0) {
		return (
			<div className="pktw-flex pktw-items-center pktw-gap-2 pktw-rounded-lg pktw-border pktw-border-border pktw-p-4">
				<SearchCheck className="pktw-w-4 pktw-h-4 pktw-text-green-500" />
				<span className="pktw-text-sm pktw-text-muted-foreground">No repair opportunities found in this scan.</span>
			</div>
		);
	}

	return (
		<div className="pktw-flex pktw-flex-col pktw-gap-3">
			{insights.map((insight) => {
				const style = SEVERITY_STYLE[insight.severity];
				const Icon = style.icon;
				const aiAction = insight.recommendedActions.find(action => action.mode === 'ai');

				return (
					<div key={insight.id} className="pktw-rounded-lg pktw-border pktw-border-border pktw-bg-background pktw-p-4">
						<div className="pktw-flex pktw-items-start pktw-justify-between pktw-gap-3">
							<div className="pktw-flex pktw-min-w-0 pktw-flex-1 pktw-gap-3">
								<div className={`pktw-flex pktw-h-8 pktw-w-8 pktw-shrink-0 pktw-items-center pktw-justify-center pktw-rounded-md ${style.className}`}>
									<Icon className="pktw-w-4 pktw-h-4" />
								</div>
								<div className="pktw-flex pktw-min-w-0 pktw-flex-1 pktw-flex-col pktw-gap-1">
									<div className="pktw-flex pktw-flex-wrap pktw-items-center pktw-gap-2">
										<span className="pktw-text-sm pktw-font-semibold pktw-text-foreground">{insight.title}</span>
										<span className="pktw-rounded pktw-bg-muted pktw-px-1.5 pktw-py-0.5 pktw-text-[9px] pktw-font-semibold pktw-uppercase pktw-tracking-wider pktw-text-muted-foreground">
											{style.label}
										</span>
									</div>
									<span className="pktw-text-[12px] pktw-leading-5 pktw-text-muted-foreground">{insight.summary}</span>
								</div>
							</div>
						</div>

						<div className="pktw-mt-3 pktw-flex pktw-flex-wrap pktw-gap-2">
							{insight.impact.map(item => (
								<div key={item.label} className="pktw-rounded-md pktw-bg-muted pktw-px-2 pktw-py-1">
									<span className="pktw-text-[10px] pktw-text-muted-foreground">{item.label}</span>
									<span className="pktw-ml-1.5 pktw-text-[11px] pktw-font-semibold">{item.value}</span>
								</div>
							))}
						</div>

						<div className="pktw-mt-3 pktw-flex pktw-flex-wrap pktw-gap-2">
							{insight.recommendedActions.map(action => (
								<ActionButton
									key={action.id}
									insight={insight}
									action={action}
									vaultNavigation={vaultNavigation}
									chatNavigation={chatNavigation}
								/>
							))}
							{aiAction?.prompt && (
								<Button variant="ghost" size="sm" className="pktw-h-7 pktw-gap-1.5 pktw-text-[11px]"
									onClick={() => void copyPrompt(aiAction.prompt)}>
									<Clipboard className="pktw-w-3.5 pktw-h-3.5" />
									Copy prompt
								</Button>
							)}
						</div>

						{insight.evidence.length > 0 && (
							<div className="pktw-mt-3 pktw-border-t pktw-border-border pktw-pt-3">
								<span className="pktw-mb-1.5 pktw-block pktw-text-[10px] pktw-font-semibold pktw-uppercase pktw-tracking-wider pktw-text-muted-foreground">
									{insight.evidenceLabel}
								</span>
								<div className="pktw-flex pktw-flex-col pktw-gap-1">
									{insight.evidence.slice(0, 4).map(finding => (
										<Button key={finding.id} variant="ghost" size="sm"
											className="pktw-h-auto pktw-justify-start pktw-gap-2 pktw-px-2 pktw-py-1.5 pktw-text-left"
											onClick={() => void openFile(finding.filePath, vaultNavigation)}>
											<ExternalLink className="pktw-w-3 pktw-h-3 pktw-shrink-0 pktw-text-muted-foreground" />
											<span className="pktw-min-w-0 pktw-truncate pktw-text-[11px] pktw-text-muted-foreground">
												{finding.filePath ?? finding.title}
											</span>
										</Button>
									))}
								</div>
							</div>
						)}
					</div>
				);
			})}
		</div>
	);
};
