import * as React from 'react';
import { Check, MessageSquare, X } from 'lucide-react';
import type { SuggestionFinding } from '@/service/composer';
import { Button } from '@/ui/components/primitives';
import type { ComposerChromeConfig } from '../config/composerConfig';

export function BlockFindingPanel({
	findings,
	strings,
	onAskCopilot,
	onConfirm,
	onDismiss,
}: {
	findings: readonly SuggestionFinding[];
	strings: ComposerChromeConfig['findings'];
	onAskCopilot(finding: SuggestionFinding): void;
	onConfirm(finding: SuggestionFinding): void;
	onDismiss(finding: SuggestionFinding): void;
}): React.ReactElement | null {
	const concrete = findings.filter((finding) => finding.body);
	const [expandedId, setExpandedId] = React.useState<string | null>(null);
	if (concrete.length === 0) return null;
	const expanded = concrete.find((finding) => finding.findingId === expandedId) ?? null;
	return (
		<div className="pk-block-findings" data-chrome="true">
			<div className="pk-block-finding-badges">
				{concrete.map((finding) => (
					<Button
						key={finding.findingId}
						variant="ghost"
						size="sm"
						className="pk-block-finding-badge"
						data-tone={finding.body!.tone}
						data-active={finding.findingId === expandedId || undefined}
						aria-expanded={finding.findingId === expandedId}
						onClick={() => setExpandedId((current) =>
							current === finding.findingId ? null : finding.findingId)}
					>
						<span aria-hidden>•</span>
						{finding.body!.label} · {finding.state === 'stale' ? strings.stale : finding.body!.statusLabel}
					</Button>
				))}
			</div>
			{expanded?.body && (
				<section className="pk-block-finding-panel" data-tone={expanded.body.tone}>
					<div className="pk-block-finding-panel__meta">
						<strong>{expanded.body.label}</strong>
						<span>{expanded.body.statusLabel}</span>
						{expanded.body.provenance && <small>{expanded.body.provenance}</small>}
					</div>
					<div className="pk-block-finding-panel__copy">
						<strong>{expanded.body.title}</strong>
						{expanded.body.detail && <span>{expanded.body.detail}</span>}
						{expanded.body.issueLabel && <em>{expanded.body.issueLabel}</em>}
					</div>
					<div className="pk-block-finding-panel__actions">
						<Button variant="outline" size="sm" onClick={() => onAskCopilot(expanded)}>
							<MessageSquare size={13} />
							{strings.askCopilot}
						</Button>
						<Button variant="outline" size="sm" onClick={() => onConfirm(expanded)}>
							<Check size={13} />
							{strings.confirm}
						</Button>
						<Button variant="ghost" size="sm" onClick={() => onDismiss(expanded)}>
							{strings.dismiss}
						</Button>
						<Button variant="ghost" size="sm" onClick={() => setExpandedId(null)}>
							<X size={13} />
							{strings.close}
						</Button>
					</div>
				</section>
			)}
		</div>
	);
}
