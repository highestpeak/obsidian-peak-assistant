import React from 'react';
import { ExternalLink, FileSearch, GitFork, Layers, Network } from 'lucide-react';
import type { VaultDigest } from '@/service/copilot/vault/VaultDigestService';
import type { VaultReviewHistoryRecord } from '@/service/copilot/vault/VaultReviewReportService';
import { Button } from '@/ui/component/shared-ui/button';
import { useServiceContext } from '@/ui/context/ServiceContext';

export interface VaultMaintenanceSegmentProps {
	lastReport: VaultReviewHistoryRecord | null;
	onOpenLastReport(): void;
	onRunReview(): void;
}

function compactNumber(value: number): string {
	return Intl.NumberFormat(undefined, { notation: 'compact', maximumFractionDigits: 1 }).format(value);
}

export const VaultMaintenanceSegment: React.FC<VaultMaintenanceSegmentProps> = ({
	lastReport,
	onOpenLastReport,
	onRunReview,
}) => {
	const { vaultReviewRuntime, vaultNavigation, vaultStats } = useServiceContext();
	const [digest, setDigest] = React.useState<VaultDigest | null>(null);
	const [loading, setLoading] = React.useState(true);

	React.useEffect(() => {
		let cancelled = false;
		if (!vaultReviewRuntime) {
			setLoading(false);
			return;
		}
		vaultReviewRuntime.getDigest()
			.then((value) => {
				if (cancelled) return;
				setDigest(value);
				setLoading(false);
			})
			.catch(() => {
				if (cancelled) return;
				setDigest(null);
				setLoading(false);
			});
		return () => {
			cancelled = true;
		};
	}, [vaultReviewRuntime]);

	if (loading) {
		return <span className="pktw-text-xs pktw-text-muted-foreground">Loading Vault structure…</span>;
	}
	if (!digest) return null;

	const currentPath = vaultStats.activeFilePath();
	const hubs = digest.hubs.slice(0, 5);
	const holes = digest.structuralHoles.slice(0, 3);

	return (
		<section className="pk-vault-maintenance" aria-label="Vault Maintenance">
			<div className="pk-vault-maintenance-head">
				<div>
					<span className="pk-vault-maintenance-title">Vault Maintenance</span>
					<span className="pk-vault-maintenance-subtitle">
						Structure, hubs, current note and the last review in one place.
					</span>
				</div>
				<Button variant="outline" size="sm" onClick={onRunReview}>
					<FileSearch aria-hidden="true" />
					Research
				</Button>
			</div>

			<div className="pk-vault-maintenance-stats">
				<span><strong>{compactNumber(digest.counts.notes)}</strong> notes</span>
				<span><strong>{compactNumber(digest.counts.words)}</strong> words</span>
				<span><strong>{digest.counts.clusters}</strong> communities</span>
				<span><strong>{digest.counts.hubs}</strong> hubs</span>
				<span><strong>{digest.counts.orphans}</strong> orphans</span>
			</div>

			<div className="pk-vault-maintenance-grid">
				<article className="pk-vault-maintenance-card">
					<span className="pk-vault-maintenance-card-title">
						<Network aria-hidden="true" />
						Vault graph overview
					</span>
					<div className="pk-vault-overview-graph">
						{hubs.map((hub, index) => (
							<Button
								key={hub.path}
								variant="unstyled"
								className={`pk-vault-overview-node${index === 0 ? ' is-main' : ''}`}
								title={hub.path}
								onClick={() => void vaultNavigation.openVaultPath(hub.path)}
							>
								{hub.path.split('/').pop()?.replace(/\.md$/i, '') ?? hub.path}
							</Button>
						))}
						{currentPath && (
							<span className="pk-vault-overview-node is-current" title={currentPath}>
								Current note
							</span>
						)}
					</div>
					{holes.map((hole) => (
						<span key={hole.id} className="pk-vault-bridge-gap">
							<GitFork aria-hidden="true" />
							{hole.communityALabel} ↔ {hole.communityBLabel}
						</span>
					))}
				</article>

				<article className="pk-vault-maintenance-card">
					<span className="pk-vault-maintenance-card-title">
						<Layers aria-hidden="true" />
						Hubs
					</span>
					{hubs.map((hub) => (
						<Button
							key={hub.path}
							variant="unstyled"
							className="pk-vault-hub-row"
							title={hub.path}
							onClick={() => void vaultNavigation.openVaultPath(hub.path)}
						>
							<span>{hub.path.split('/').pop()?.replace(/\.md$/i, '') ?? hub.path}</span>
							<ExternalLink aria-hidden="true" />
						</Button>
					))}
					{digest.staleHubs.length > 0 && (
						<span className="pk-vault-maintenance-warning">
							{digest.staleHubs.length} stale hub{digest.staleHubs.length === 1 ? '' : 's'}
						</span>
					)}
				</article>

				<article className="pk-vault-maintenance-card">
					<span className="pk-vault-maintenance-card-title">
						<FileSearch aria-hidden="true" />
						Last report
					</span>
					{lastReport ? (
						<>
							<span className="pk-vault-last-report-title">
								{lastReport.headline?.trim() || 'Vault review'}
							</span>
							<span className="pk-vault-last-report-meta">
								{lastReport.insightCount} insights · {lastReport.actionCount} actions
							</span>
							<Button variant="outline" size="sm" onClick={onOpenLastReport}>
								View last report
							</Button>
						</>
					) : (
						<>
							<span className="pk-vault-maintenance-empty">No cached Vault review yet.</span>
							<Button variant="outline" size="sm" onClick={onRunReview}>
								Run first review
							</Button>
						</>
					)}
				</article>
			</div>
		</section>
	);
};
