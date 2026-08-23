import type { ReviewPreparationProjection, ReviewPreparationSession } from '@/core/types/review-preparation';

export function projectReviewPreparation(session: ReviewPreparationSession): ReviewPreparationProjection {
	const total = session.atoms.length;
	const terminalJobs = session.jobs.filter((job) => ['completed', 'attention'].includes(job.status)).length;
	const percent = session.planFrozenAt === null ? null : session.status === 'completed' || session.status === 'completed-with-attention'
		? 100
		: Math.floor(Math.min(100,
			(total > 0 ? session.dispositions.length / total : 1) * 20
			+ 15
			+ (session.jobs.length > 0 ? terminalJobs / session.jobs.length : 1) * 30
			+ (session.jobs.length > 0 ? session.artifacts.length / session.jobs.length : 1) * 25,
		));
	return {
		status: session.status,
		phase: session.phase,
		percent,
		findingsAccounted: { processed: session.dispositions.length, total },
		tasksPlanned: session.planFrozenAt === null ? null : session.jobs.length,
		ready: session.jobs.filter((job) => job.status === 'completed').length,
		attention: session.jobs.filter((job) => job.status === 'attention').length,
		jobs: session.jobs,
		artifacts: session.artifacts,
		stream: session.stream,
	};
}
