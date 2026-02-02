/**
 * Graph visualization config and constants.
 */

export interface GraphConfig {
	linkDistance: number;
	chargeStrength: number;
	collisionRadius: number;
}

export const DEFAULT_CONFIG: GraphConfig = {
	linkDistance: 60,
	chargeStrength: -50,
	collisionRadius: 20,
};

export const SLIDER_CONFIGS = {
	linkDistance: { min: 30, max: 500, step: 10 },
	chargeStrength: { min: -100, max: 50, step: 5 },
	collisionRadius: { min: 10, max: 80, step: 2 },
} as const;

export type GraphCopyFormat = 'markdown' | 'json' | 'mermaid';
