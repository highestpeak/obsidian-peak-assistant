import React from 'react';
import { ExternalLink, EyeOff } from 'lucide-react';
import { Button } from '@/ui/component/shared-ui/button';
import { AppContext } from '@/app/context/AppContext';
import type { LintFinding } from '@/service/lint/types';

interface FindingDetailProps {
	finding: LintFinding;
	onDismiss?: (finding: LintFinding) => void;
}

export function FindingDetail({ finding, onDismiss }: FindingDetailProps) {
	const handleOpen = async () => {
		if (!finding.filePath) return;
		const app = AppContext.getApp();
		const file = app.vault.getAbstractFileByPath(finding.filePath);
		if (file) {
			await app.workspace.getLeaf('tab').openFile(file as any);
		}
	};

	return (
		<div className="pktw-rounded-md pktw-border pktw-border-border pktw-bg-background pktw-p-3 pktw-space-y-2">
			<span className="pktw-text-sm pktw-font-medium">{finding.title}</span>
			<span className="pktw-text-xs pktw-text-muted-foreground pktw-block">{finding.description}</span>

			{finding.filePath && (
				<span className="pktw-text-xs pktw-font-mono pktw-text-muted-foreground pktw-block pktw-truncate">
					{finding.filePath}
				</span>
			)}

			{Object.keys(finding.metadata).length > 0 && (
				<div className="pktw-text-xs pktw-text-muted-foreground pktw-space-y-0.5">
					{Object.entries(finding.metadata).map(([key, value]) => (
						<div key={key} className="pktw-flex pktw-gap-2">
							<span className="pktw-opacity-60">{key}:</span>
							<span>{String(value)}</span>
						</div>
					))}
				</div>
			)}

			<div className="pktw-flex pktw-items-center pktw-gap-2 pktw-pt-1">
				{finding.filePath && (
					<Button variant="outline" size="xs" onClick={handleOpen}>
						<ExternalLink className="pktw-h-3 pktw-w-3 pktw-mr-1" />
						Open
					</Button>
				)}
				{onDismiss && (
					<Button variant="ghost" size="xs" onClick={() => onDismiss(finding)}>
						<EyeOff className="pktw-h-3 pktw-w-3 pktw-mr-1" />
						Dismiss
					</Button>
				)}
			</div>
		</div>
	);
}
