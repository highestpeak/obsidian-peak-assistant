/**
 * Pure helpers for Project Plans (chat-studio §9.1 / PROJ-04). Kept UI-free
 * so the sorting / status-label mapping / transition validation can be unit
 * tested without React.
 */

import type {
	ProjectPlanRef,
	ProjectPlanStatus,
} from '@/core/types/chat-studio';
import { PROJECT_PLAN_STATUSES } from '@/core/types/chat-studio';

/**
 * Row sort: active plans first, then planned/blocked, then done, then
 * archived; within each bucket newest first. Deterministic — same inputs
 * always produce the same order.
 */
const STATUS_WEIGHT: Record<ProjectPlanStatus, number> = {
	active: 0,
	planned: 1,
	blocked: 2,
	done: 3,
	archived: 4,
};

export function sortPlans(plans: ProjectPlanRef[]): ProjectPlanRef[] {
	return [...plans].sort((a, b) => {
		const wa = STATUS_WEIGHT[a.status] ?? 99;
		const wb = STATUS_WEIGHT[b.status] ?? 99;
		if (wa !== wb) return wa - wb;
		return (b.updatedAt ?? 0) - (a.updatedAt ?? 0);
	});
}

/**
 * All 5 statuses are user-selectable. Guardrail: an unknown value keeps the
 * current status unchanged. Encapsulated so the UI menu + the reducer share
 * one source of truth.
 */
export function nextStatus(current: ProjectPlanStatus, requested: string): ProjectPlanStatus {
	return (PROJECT_PLAN_STATUSES.includes(requested as ProjectPlanStatus)
		? (requested as ProjectPlanStatus)
		: current);
}

export function statusLabel(
	status: ProjectPlanStatus,
	strings: {
		planStatusPlanned: string;
		planStatusActive: string;
		planStatusBlocked: string;
		planStatusDone: string;
		planStatusArchived: string;
	},
): string {
	switch (status) {
		case 'active': return strings.planStatusActive;
		case 'planned': return strings.planStatusPlanned;
		case 'blocked': return strings.planStatusBlocked;
		case 'done': return strings.planStatusDone;
		case 'archived': return strings.planStatusArchived;
	}
}
