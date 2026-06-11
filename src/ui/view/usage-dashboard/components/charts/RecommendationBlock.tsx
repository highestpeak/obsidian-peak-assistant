import * as React from 'react';
import type {
	Recommendation,
	RecommendationImpact,
} from '@/service/usage/optimization';

const IMPACT_LABEL: Record<RecommendationImpact, string> = {
	high: 'High impact',
	medium: 'Medium impact',
	low: 'Low impact',
	investigate: 'Investigate',
};

const IMPACT_TONE: Record<RecommendationImpact, 'bad' | 'warn' | 'soft' | 'info'> = {
	high: 'bad',
	medium: 'warn',
	low: 'soft',
	investigate: 'info',
};

export interface RecommendationBlockProps {
	num: number;
	rec: Recommendation;
	onApply?: (rec: Recommendation) => void;
	onPreview?: (rec: Recommendation) => void;
	strings: {
		apply: string;
		preview: string;
		openTraces: string;
		estMonthlySaving: string;
		evidenceColumns: {
			started: string;
			goal: string;
			model: string;
			cost: string;
		};
	};
}

/**
 * Single Recommendation row on the Optimization screen. Three columns:
 * num badge / body (title + sub + dl detail or evidence table) / side panel
 * (est saving + Apply/Preview verbs).
 */
export function RecommendationBlock({
	num,
	rec,
	onApply,
	onPreview,
	strings,
}: RecommendationBlockProps) {
	const isInvestigate = rec.impact === 'investigate';
	return (
		<div className="pk-rec-block">
			<div className="pk-rec-block__num">{num}</div>
			<div className="pk-rec-block__body">
				<div className="pk-rec-block__heading">
					<span className="pk-rec-block__title">{rec.title}</span>
					<span className={`pk-badge pk-badge--${IMPACT_TONE[rec.impact]}`}>
						{IMPACT_LABEL[rec.impact]}
					</span>
				</div>
				<p className="pk-rec-block__sub">{rec.sub}</p>
				{rec.detail && rec.detail.length > 0 ? (
					<dl className="pk-rec-block__detail">
						{rec.detail.map((d, i) => (
							<div key={i} className="pk-rec-block__detail-cell">
								<dt>{d.label}</dt>
								<dd>{d.value}</dd>
							</div>
						))}
					</dl>
				) : null}
				{rec.evidence && rec.evidence.length > 0 ? (
					<table className="pk-rec-block__evidence">
						<thead>
							<tr>
								<th>{strings.evidenceColumns.started}</th>
								<th>{strings.evidenceColumns.goal}</th>
								<th>{strings.evidenceColumns.model}</th>
								<th className="pk-rec-block__evidence-num">{strings.evidenceColumns.cost}</th>
							</tr>
						</thead>
						<tbody>
							{rec.evidence.map((e) => (
								<tr key={`${e.usageLogId ?? e.startedIso}-${e.goal}`}>
									<td className="pk-mono">{formatDate(e.startedIso)}</td>
									<td>{e.goal}</td>
									<td>{e.model}</td>
									<td className="pk-rec-block__evidence-num pk-rec-block__evidence-num--bad">
										${e.costUsd.toFixed(2)}
									</td>
								</tr>
							))}
						</tbody>
					</table>
				) : null}
			</div>
			<div className="pk-rec-block__side">
				<div>
					<div className="pk-rec-block__side-label">{strings.estMonthlySaving}</div>
					<div className="pk-rec-block__save">
						{rec.estMonthlySavingUsd > 0 ? `$${rec.estMonthlySavingUsd.toFixed(2)}` : '—'}
					</div>
				</div>
				<div className="pk-rec-block__actions">
					{isInvestigate ? (
						<button
							type="button"
							className="pk-btn pk-btn--sm"
							onClick={() => onPreview?.(rec)}
						>
							{strings.openTraces}
						</button>
					) : (
						<>
							<button
								type="button"
								className="pk-btn pk-btn--primary pk-btn--sm"
								onClick={() => onApply?.(rec)}
							>
								{strings.apply}
							</button>
							<button
								type="button"
								className="pk-btn pk-btn--ghost pk-btn--sm"
								onClick={() => onPreview?.(rec)}
							>
								{strings.preview}
							</button>
						</>
					)}
				</div>
			</div>
		</div>
	);
}

function formatDate(iso: string): string {
	const d = new Date(iso);
	if (Number.isNaN(d.getTime())) return iso;
	return d.toLocaleDateString(undefined, { month: 'short', day: 'numeric' });
}
