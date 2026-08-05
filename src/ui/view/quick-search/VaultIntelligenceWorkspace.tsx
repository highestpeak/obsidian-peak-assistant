import React from 'react';
import {
	AlertCircle,
	ChevronRight,
	CircleDotDashed,
	Clock3,
	FileSearch,
	Files,
	GitFork,
	Network,
	Waypoints,
} from 'lucide-react';
import type { VaultDigest } from '@/service/copilot/vault/VaultDigestService';
import type { VaultReviewHistoryRecord } from '@/service/copilot/vault/VaultReviewReportService';
import { Button } from '@/ui/component/shared-ui/button';
import { useServiceContext } from '@/ui/context/ServiceContext';

export interface VaultIntelligenceWorkspaceProps {
	onRunReview(mode: 'fast' | 'complete'): void;
	onOpenRecord(record: VaultReviewHistoryRecord): void;
}

const COMMUNITY_POSITIONS = [
	{ left: 50, top: 50 },
	{ left: 16, top: 22 },
	{ left: 82, top: 20 },
	{ left: 20, top: 78 },
	{ left: 80, top: 78 },
	{ left: 50, top: 12 },
] as const;

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

function noteName(path: string): string {
	return path.split('/').pop()?.replace(/\.md$/i, '') ?? path;
}

function MetricCard({
	icon,
	value,
	label,
	detail,
	tone,
}: {
	icon: React.ReactNode;
	value: string;
	label: string;
	detail: string;
	tone?: 'attention';
}): React.ReactElement {
	return (
		<div className={`pk-vault-metric-card${tone ? ` is-${tone}` : ''}`}>
			<span className="pk-vault-metric-icon" aria-hidden>{icon}</span>
			<span className="pk-vault-metric-copy">
				<span>{label}</span>
				<strong>{value}</strong>
				<small>{detail}</small>
			</span>
		</div>
	);
}

function CommunityMap({ digest }: { digest: VaultDigest }): React.ReactElement {
	const communities = digest.clusters.slice(0, COMMUNITY_POSITIONS.length);
	const positionsByLabel = new Map(
		communities.map((community, index) => [community.label, COMMUNITY_POSITIONS[index]]),
	);
	const connections = digest.structuralHoles.flatMap((hole) => {
		const from = positionsByLabel.get(hole.communityALabel);
		const to = positionsByLabel.get(hole.communityBLabel);
		return from && to ? [{ id: hole.id, from, to }] : [];
	});

	if (communities.length === 0) {
		return (
			<div className="pk-vault-community-map is-empty">
				<Network aria-hidden />
				<span>Community structure will appear after the local index is ready.</span>
			</div>
		);
	}

	return (
		<div className="pk-vault-community-map" aria-label="Vault community graph overview">
			<svg viewBox="0 0 100 100" preserveAspectRatio="none" aria-hidden>
				{connections.map((connection) => (
					<line
						key={connection.id}
						x1={connection.from.left}
						y1={connection.from.top}
						x2={connection.to.left}
						y2={connection.to.top}
					/>
				))}
			</svg>
			{communities.map((community, index) => {
				const position = COMMUNITY_POSITIONS[index];
				return (
					<span
						key={community.id}
						className={`pk-vault-community-node${index === 0 ? ' is-primary' : ''}`}
						style={{ left: `${position.left}%`, top: `${position.top}%` }}
						title={`${community.label} · ${community.memberCount} notes`}
					>
						<strong>{community.label}</strong>
						<small>{community.memberCount} notes</small>
					</span>
				);
			})}
		</div>
	);
}

/** Read-only Vault health projection. Review work starts only from explicit actions. */
export const VaultIntelligenceWorkspace: React.FC<VaultIntelligenceWorkspaceProps> = ({
	onRunReview,
	onOpenRecord,
}) => {
	const { vaultReviewRuntime, vaultNavigation } = useServiceContext();
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
				<Network aria-hidden />
				<span>Reading the latest Vault structure…</span>
			</div>
		);
	}

	const hubs = digest?.hubs.slice(0, 5) ?? [];
	const holes = digest?.structuralHoles.slice(0, 3) ?? [];
	const staleHubs = digest?.staleHubs.slice(0, 2) ?? [];
	const attentionCount = digest
		? digest.structuralHoles.length + digest.staleHubs.length + digest.counts.orphans
		: 0;

	return (
		<div className="pk-vault-intelligence-workspace">
			<header className="pk-vault-intelligence-header">
				<div className="pk-vault-intelligence-heading">
					<span className="pk-vault-intelligence-eyebrow">Vault health snapshot</span>
					<span className="pk-vault-intelligence-title">Vault Intelligence</span>
					<span className="pk-vault-intelligence-meta">
						{digest ? `Updated ${relativeTime(digest.computedAt)}` : 'Local structure is not available yet'}
					</span>
				</div>
				<div className="pk-vault-intelligence-actions">
					<Button
						variant="ghost"
						geometry="action"
						className="pk-vault-quick-review"
						onClick={() => onRunReview('fast')}
					>
						Quick check
					</Button>
					<Button
						variant="default"
						geometry="action"
						className="pk-vault-run-review"
						onClick={() => onRunReview('complete')}
					>
						<FileSearch aria-hidden />
						Run review
					</Button>
				</div>
			</header>

			{digest ? (
				<>
					<div className="pk-vault-health-summary">
						<div className="pk-vault-health-score">
							<span>Health</span>
							<strong>{digest.health ? digest.health.score.toFixed(1) : '—'}</strong>
							<small>{digest.health ? '/ 10' : 'Not reviewed'}</small>
						</div>
						<span className="pk-vault-health-summary-copy">
							<strong>{attentionCount > 0 ? `${attentionCount} items need attention` : 'Structure looks healthy'}</strong>
							<small>
								{digest.recentActivity.modifiedLast30d} notes changed in the last 30 days
							</small>
						</span>
					</div>

					<div className="pk-vault-metric-grid">
						<MetricCard
							icon={<Files />}
							label="Notes"
							value={compactNumber(digest.counts.notes)}
							detail={`${compactNumber(digest.counts.words)} words indexed`}
						/>
						<MetricCard
							icon={<Waypoints />}
							label="Communities"
							value={String(digest.counts.clusters)}
							detail={`${digest.counts.hubs} connected hubs`}
						/>
						<MetricCard
							icon={<AlertCircle />}
							label="Needs attention"
							value={String(attentionCount)}
							detail={`${digest.structuralHoles.length} bridge gaps · ${digest.staleHubs.length} stale hubs`}
							tone={attentionCount > 0 ? 'attention' : undefined}
						/>
						<MetricCard
							icon={<CircleDotDashed />}
							label="Orphans"
							value={String(digest.counts.orphans)}
							detail={`${digest.counts.danglingRefs} dangling references`}
							tone={digest.counts.orphans > 0 ? 'attention' : undefined}
						/>
					</div>

					<div className="pk-vault-insight-grid">
						<section className="pk-vault-community-card" aria-label="Vault community overview">
							<div className="pk-vault-card-heading">
								<span>
									<Network aria-hidden />
									<strong>Community overview</strong>
								</span>
								<small>Structural connections from the local index</small>
							</div>
							<CommunityMap digest={digest} />
						</section>

						<aside className="pk-vault-intelligence-side">
							<section className="pk-vault-side-card" aria-label="Vault items needing attention">
								<div className="pk-vault-card-heading">
									<span><AlertCircle aria-hidden /><strong>Needs attention</strong></span>
									<small>Highest-impact structural issues</small>
								</div>
								<div className="pk-vault-attention-list">
									{holes.map((hole) => (
										<span key={hole.id} className="pk-vault-attention-row">
											<GitFork aria-hidden />
											<span>
												<strong>Bridge gap</strong>
												<small>{hole.communityALabel} ↔ {hole.communityBLabel}</small>
											</span>
										</span>
									))}
									{staleHubs.map((hub) => (
										<Button
											key={hub.path}
											variant="unstyled"
											className="pk-vault-attention-row"
											onClick={() => void vaultNavigation.openLink(hub.path)}
										>
											<Clock3 aria-hidden />
											<span>
												<strong>Stale hub</strong>
												<small>{noteName(hub.path)}</small>
											</span>
										</Button>
									))}
									{holes.length === 0 && staleHubs.length === 0 ? (
										<span className="pk-vault-attention-clear">No urgent structural issues.</span>
									) : null}
								</div>
							</section>

							<section className="pk-vault-side-card" aria-label="Top Vault hubs">
								<div className="pk-vault-card-heading">
									<span><Waypoints aria-hidden /><strong>Top hubs</strong></span>
									<small>Most connected notes</small>
								</div>
								<div className="pk-vault-hub-list">
									{hubs.map((hub) => (
										<Button
											key={hub.path}
											variant="unstyled"
											className="pk-vault-hub-item"
											onClick={() => void vaultNavigation.openLink(hub.path)}
										>
											<span>
												<strong>{noteName(hub.path)}</strong>
												<small>{hub.incomingCount ?? 0} incoming links</small>
											</span>
											<ChevronRight aria-hidden />
										</Button>
									))}
								</div>
							</section>
						</aside>
					</div>
				</>
			) : (
				<div className="pk-vault-intelligence-empty">
					<Network aria-hidden />
					<span>Vault structure is unavailable until the local index is ready.</span>
				</div>
			)}

			<section className="pk-vault-intelligence-history" aria-label="Recent Vault reviews">
				<div className="pk-vault-intelligence-history-title">
					<span>Recent reviews</span>
					<small>Completed Vault reviews, newest first</small>
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
						<ChevronRight aria-hidden />
					</Button>
				)) : (
					<div className="pk-vault-intelligence-empty">
						<span>No Vault review history yet.</span>
						<Button variant="outline" geometry="action" onClick={() => onRunReview('complete')}>Run first review</Button>
					</div>
				)}
			</section>
		</div>
	);
};
