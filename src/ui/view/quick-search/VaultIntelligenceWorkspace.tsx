import React from 'react';
import { ChevronRight, ExternalLink, FileSearch, GitFork, Layers, Network } from 'lucide-react';
import type { VaultDigest } from '@/service/copilot/vault/VaultDigestService';
import type { VaultReviewHistoryRecord } from '@/service/copilot/vault/VaultReviewReportService';
import { Button } from '@/ui/component/shared-ui/button';
import { useServiceContext } from '@/ui/context/ServiceContext';

export interface VaultIntelligenceWorkspaceProps {
	onRunReview(mode: 'fast' | 'complete'): void;
	onOpenRecord(record: VaultReviewHistoryRecord): void;
}

function compactNumber(value: number): string {
	return Intl.NumberFormat(undefined, { notation: 'compact', maximumFractionDigits: 1 }).format(value);
}

function relativeTime(timestamp: number): string {
	const minutes = Math.floor((Date.now() - timestamp) / 60_000);
	if (minutes < 60) return `${Math.max(1, minutes)}m ago`;
	const hours = Math.floor(minutes / 60);
	if (hours < 24) return `${hours}h ago`;
	const days = Math.floor(hours / 24);
	if (days < 30) return `${days}d ago`;
	return new Date(timestamp).toLocaleDateString();
}

/**
 * Vault-wide intelligence projection owned by Quick Search.
 *
 * This is deliberately not a locked Copilot picker tab. It reads the existing
 * Vault review runtime, presents the Vault graph/health projection, and routes
 * explicit review actions to the existing app-owned modal.
 */
export const VaultIntelligenceWorkspace: React.FC<VaultIntelligenceWorkspaceProps> = ({
	onRunReview,
	onOpenRecord,
}) => {
	const { vaultReviewRuntime, vaultNavigation, vaultStats } = useServiceContext();
	const [digest, setDigest] = React.useState<VaultDigest | null>(null);
	const [records, setRecords] = React.useState<VaultReviewHistoryRecord[]>([]);
	const [loading, setLoading] = React.useState(true);

	React.useEffect(() => {
		let cancelled = false;
		if (!vaultReviewRuntime) {
			setLoading(false);
			return;
		}
		setLoading(true);
		Promise.all([
			vaultReviewRuntime.getDigest(),
			vaultReviewRuntime.listReports(8),
		]).then(([nextDigest, nextRecords]) => {
			if (cancelled) return;
			setDigest(nextDigest);
			setRecords(nextRecords);
			setLoading(false);
		}).catch(() => {
			if (cancelled) return;
			setDigest(null);
			setRecords([]);
			setLoading(false);
		});
		return () => {
			cancelled = true;
		};
	}, [vaultReviewRuntime]);

	if (loading) {
		return (
			<div className="pk-vault-intelligence-loading">
				<span>Loading Vault Intelligence…</span>
			</div>
		);
	}

	const hubs = digest?.hubs.slice(0, 6) ?? [];
	const holes = digest?.structuralHoles.slice(0, 4) ?? [];
	const currentPath = vaultStats.activeFilePath();

	return (
		<div className="pk-vault-intelligence-workspace">
			<header className="pk-vault-intelligence-header">
				<div>
					<span className="pk-vault-maintenance-title">Vault Intelligence</span>
					<span className="pk-vault-maintenance-subtitle">
						Vault-wide structure, hubs, health and review history. Opening this mode never starts a scan.
					</span>
				</div>
				<div className="pk-vault-intelligence-actions">
					<Button variant="outline" size="sm" onClick={() => onRunReview('fast')}>
						Quick review
					</Button>
					<Button variant="default" size="sm" onClick={() => onRunReview('complete')}>
						<FileSearch aria-hidden="true" />
						Complete review
					</Button>
				</div>
			</header>

			{digest ? (
				<>
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
										onClick={() => void vaultNavigation.openLink(hub.path)}
									>
										{hub.path.split('/').pop()?.replace(/\.md$/i, '') ?? hub.path}
									</Button>
								))}
								{currentPath ? <span className="pk-vault-overview-node is-current">Current note</span> : null}
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
									onClick={() => void vaultNavigation.openLink(hub.path)}
								>
									<span>{hub.path.split('/').pop()?.replace(/\.md$/i, '') ?? hub.path}</span>
									<ExternalLink aria-hidden="true" />
								</Button>
							))}
							{digest.staleHubs.length > 0 ? (
								<span className="pk-vault-maintenance-warning">
									{digest.staleHubs.length} stale hub{digest.staleHubs.length === 1 ? '' : 's'}
								</span>
							) : null}
						</article>
					</div>
				</>
			) : (
				<div className="pk-vault-intelligence-empty">
					<span>Vault structure is unavailable until the local index is ready.</span>
				</div>
			)}

			<section className="pk-vault-intelligence-history" aria-label="Recent Vault reviews">
				<div className="pk-vault-intelligence-history-title">
					<span>Recent reviews</span>
					<small>Vault review records, newest first</small>
				</div>
				{records.length > 0 ? records.map((record) => (
					<Button
						key={record.id}
						variant="unstyled"
						className="pk-vault-intelligence-history-row"
						onClick={() => onOpenRecord(record)}
					>
						<span>
							<strong>{record.headline?.trim() || 'Vault review'}</strong>
							<small>{record.clusterCount} communities · {record.gapCount} gaps · {record.actionCount} actions</small>
						</span>
						<time>{relativeTime(record.completedAt)}</time>
						<ChevronRight aria-hidden="true" />
					</Button>
				)) : (
					<div className="pk-vault-intelligence-empty">
						<span>No Vault review history yet.</span>
						<Button variant="outline" size="sm" onClick={() => onRunReview('complete')}>Run first review</Button>
					</div>
				)}
			</section>
		</div>
	);
};
