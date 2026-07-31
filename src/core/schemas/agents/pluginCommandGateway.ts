import { z } from 'zod';

export const pluginCommandCurationFindingSchema = z.object({
	commandId: z.string().min(1),
	recommend: z.boolean(),
	risk: z.enum(['read', 'edit', 'destructive', 'unknown']),
	purpose: z.enum([
		'navigation',
		'capture',
		'planning',
		'tasks',
		'query',
		'formatting',
		'system',
		'other',
	]),
	summary: z.string().min(1).max(500),
	evidence: z.array(z.string().min(1).max(240)).max(8),
	requiresActiveEditor: z.boolean(),
	interaction: z.enum(['direct', 'modal', 'unknown']),
	expectedObservation: z.enum(['workspace', 'vault', 'modal', 'none', 'unknown']),
	toolDescription: z.string().min(1).max(500),
	confirmation: z.enum(['none', 'per-run', 'always']),
	skillName: z.string().min(1).max(120),
	skillDescription: z.string().min(1).max(500),
	skillInstructions: z.string().min(1).max(1500),
});

export const pluginCommandCurationResponseSchema = z.object({
	findings: z.array(pluginCommandCurationFindingSchema),
});

export type PluginCommandCurationResponse = z.infer<typeof pluginCommandCurationResponseSchema>;
