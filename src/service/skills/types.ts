/**
 * Skill = markdown-defined reusable agent workflow.
 *
 * Skills live in a configurable vault folder (by default under ai.rootFolder)
 * or are bundled as built-in defaults. Each skill specifies:
 *   - Metadata (id, name, description, tags)
 *   - Tool whitelist (builtin + MCP)
 *   - Model preferences (recommended model, min capabilities)
 *   - User inputs (dynamic form fields)
 *   - System prompt + optional output template
 *   - For pipeline skills: sequential phases, each with its own tools + prompt
 */

export interface SkillDefinition {
	// ── Frontmatter metadata ──────────────────────────────────────────
	id: string;
	name: string;
	version: string;
	author: string;
	description: string;
	icon?: string;
	tags: string[];
	license: 'free' | 'community' | 'premium';
	type: 'simple' | 'pipeline';

	// ── Tool whitelist ────────────────────────────────────────────────
	tools?: {
		builtin?: string[];
		mcp?: string[]; // MCP tool names (mcp_serverName_toolName)
	};

	// ── Model preferences ─────────────────────────────────────────────
	model?: {
		recommended?: string;
		minCapabilities?: Record<string, boolean>;
		outputControl?: {
			temperature?: number;
			reasoningEffort?: 'low' | 'medium' | 'high';
		};
	};

	// ── User inputs ───────────────────────────────────────────────────
	inputs?: SkillInput[];

	// ── Pipeline phases (type: 'pipeline' only) ───────────────────────
	phases?: SkillPhase[];

	// ── Parsed markdown body sections ─────────────────────────────────
	systemPrompt: string;
	outputTemplate?: string;

	// ── Source info ────────────────────────────────────────────────────
	source: 'builtin' | 'vault';
	filePath?: string;
}

export interface SkillInput {
	name: string;
	type: 'file' | 'text' | 'selection' | 'active-note';
	description: string;
	required: boolean;
	default?: string;
}

export interface SkillPhase {
	name: string;
	tools: { builtin?: string[]; mcp?: string[] };
	prompt: string;
}

export interface SkillExecutionContext {
	skillId: string;
	inputs: Record<string, string>;
	signal?: AbortSignal;
}

export interface SkillExecutionResult {
	skillId: string;
	output: string;
	phaseResults?: Array<{ phaseName: string; output: string }>;
	usage?: {
		inputTokens: number;
		outputTokens: number;
		durationMs: number;
	};
}
