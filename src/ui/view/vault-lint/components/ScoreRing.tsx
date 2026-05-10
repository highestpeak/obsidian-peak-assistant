import React from 'react';
import { scoreLabel, scoreColorClass } from '@/service/lint/HealthScoreEngine';

interface ScoreRingProps {
	score: number;
	lastScanAgo: string;
}

export const ScoreRing: React.FC<ScoreRingProps> = ({ score, lastScanAgo }) => {
	const radius = 52;
	const circumference = 2 * Math.PI * radius;
	const filled = (score / 100) * circumference;
	const colorClass = scoreColorClass(score);
	const label = scoreLabel(score);

	return (
		<div className="pktw-flex pktw-flex-col pktw-items-center pktw-justify-center pktw-gap-2">
			<svg width="128" height="128" viewBox="0 0 128 128">
				<circle cx="64" cy="64" r={radius} fill="none" strokeWidth="10"
					className="pktw-stroke-muted" />
				<circle cx="64" cy="64" r={radius} fill="none" strokeWidth="10"
					strokeDasharray={`${filled} ${circumference}`}
					strokeLinecap="round" className={colorClass.replace('text', 'stroke')}
					transform="rotate(-90 64 64)" />
				<text x="64" y="60" textAnchor="middle" dominantBaseline="middle"
					className="pktw-fill-foreground" style={{ fontSize: 28, fontWeight: 700 }}>
					{score}
				</text>
				<text x="64" y="82" textAnchor="middle"
					className="pktw-fill-muted-foreground" style={{ fontSize: 11 }}>
					/ 100
				</text>
			</svg>
			<span className={`pktw-text-xs pktw-font-semibold pktw-uppercase pktw-tracking-wider ${colorClass}`}>
				{label}
			</span>
			<span className="pktw-text-[10px] pktw-text-muted-foreground">{lastScanAgo}</span>
		</div>
	);
};
