/**
 * Parse markdown files with YAML frontmatter into SkillDefinition objects.
 *
 * Expected format:
 *   ---
 *   id: my-skill
 *   name: My Skill
 *   ...frontmatter fields...
 *   ---
 *
 *   ## System Prompt
 *   ...prompt text...
 *
 *   ## Output Template
 *   ...template text...
 */

import { parse as parseYaml } from 'yaml';
import type { SkillDefinition, SkillInput, SkillPhase } from './types';

const FRONTMATTER_REGEX = /^---\r?\n([\s\S]*?)\r?\n---/;

/**
 * Extract frontmatter YAML and body from a markdown string.
 */
function splitFrontmatterAndBody(content: string): { frontmatter: string; body: string } {
	const match = content.match(FRONTMATTER_REGEX);
	if (!match) return { frontmatter: '', body: content };
	const frontmatter = match[1];
	const body = content.slice(match[0].length).trim();
	return { frontmatter, body };
}

/**
 * Extract a named section from markdown body.
 * Returns text between `## SectionName` and the next `##` heading (or EOF).
 */
function extractSection(body: string, sectionName: string): string | undefined {
	const pattern = new RegExp(
		`^## ${escapeRegex(sectionName)}\\s*\\r?\\n([\\s\\S]*?)(?=^## |$)`,
		'm',
	);
	const match = body.match(pattern);
	return match?.[1]?.trim() || undefined;
}

function escapeRegex(str: string): string {
	return str.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

/**
 * Parse a skill markdown file into a SkillDefinition.
 *
 * @param content - Raw markdown string
 * @param source - Where the skill came from ('builtin' | 'vault')
 * @param filePath - Optional vault file path for vault skills
 * @returns Parsed SkillDefinition
 * @throws Error if required fields are missing or invalid
 */
export function parseSkillMarkdown(
	content: string,
	source: 'builtin' | 'vault',
	filePath?: string,
): SkillDefinition {
	const { frontmatter: fmStr, body } = splitFrontmatterAndBody(content);
	if (!fmStr) {
		throw new Error(`Skill file has no frontmatter${filePath ? ` (${filePath})` : ''}`);
	}

	const fm = parseYaml(fmStr) as Record<string, unknown>;
	if (!fm || typeof fm !== 'object') {
		throw new Error(`Invalid YAML frontmatter${filePath ? ` in ${filePath}` : ''}`);
	}

	// Required fields
	const id = requireString(fm, 'id', filePath);
	const name = requireString(fm, 'name', filePath);
	const type = requireString(fm, 'type', filePath) as 'simple' | 'pipeline';
	if (type !== 'simple' && type !== 'pipeline') {
		throw new Error(`Invalid skill type "${type}"${filePath ? ` in ${filePath}` : ''} (expected "simple" or "pipeline")`);
	}

	// Optional fields with defaults
	const version = optString(fm, 'version') ?? '1.0.0';
	const author = optString(fm, 'author') ?? 'Unknown';
	const description = optString(fm, 'description') ?? '';
	const icon = optString(fm, 'icon');
	const tags = asStringArray(fm.tags);
	const license = (optString(fm, 'license') ?? 'free') as 'free' | 'community' | 'premium';

	// Tools
	const tools = parseTools(fm.tools);

	// Model preferences
	const model = parseModel(fm.model);

	// Inputs
	const inputs = parseInputs(fm.inputs);

	// Phases (pipeline only)
	const phases = type === 'pipeline' ? parsePhases(fm.phases, filePath) : undefined;

	// Markdown body sections
	const systemPrompt = extractSection(body, 'System Prompt') ?? '';
	const outputTemplate = extractSection(body, 'Output Template');

	// For pipeline skills, systemPrompt may be empty (prompts are in phases)
	if (type === 'simple' && !systemPrompt) {
		throw new Error(`Simple skill "${id}" requires a ## System Prompt section${filePath ? ` in ${filePath}` : ''}`);
	}
	if (type === 'pipeline' && (!phases || phases.length === 0)) {
		throw new Error(`Pipeline skill "${id}" requires at least one phase${filePath ? ` in ${filePath}` : ''}`);
	}

	return {
		id, name, version, author, description, icon, tags, license, type,
		tools, model, inputs, phases,
		systemPrompt, outputTemplate,
		source, filePath,
	};
}

/**
 * Validate a SkillDefinition and return a list of validation errors.
 * Returns empty array if valid.
 */
export function validateSkillDefinition(skill: SkillDefinition): string[] {
	const errors: string[] = [];
	if (!skill.id) errors.push('Missing id');
	if (!skill.name) errors.push('Missing name');
	if (!skill.type) errors.push('Missing type');
	if (skill.type === 'simple' && !skill.systemPrompt) {
		errors.push('Simple skill requires a System Prompt section');
	}
	if (skill.type === 'pipeline') {
		if (!skill.phases || skill.phases.length === 0) {
			errors.push('Pipeline skill requires at least one phase');
		}
		for (const phase of skill.phases ?? []) {
			if (!phase.name) errors.push('Phase missing name');
			if (!phase.prompt) errors.push(`Phase "${phase.name}" missing prompt`);
		}
	}
	if (skill.inputs) {
		const names = new Set<string>();
		for (const input of skill.inputs) {
			if (!input.name) errors.push('Input missing name');
			if (names.has(input.name)) errors.push(`Duplicate input name: ${input.name}`);
			names.add(input.name);
		}
	}
	return errors;
}

// ── Internal helpers ──────────────────────────────────────────────────

function requireString(obj: Record<string, unknown>, key: string, filePath?: string): string {
	const val = obj[key];
	if (typeof val !== 'string' || !val.trim()) {
		throw new Error(`Missing required field "${key}"${filePath ? ` in ${filePath}` : ''}`);
	}
	return val.trim();
}

function optString(obj: Record<string, unknown>, key: string): string | undefined {
	const val = obj[key];
	if (typeof val !== 'string') return undefined;
	return val.trim() || undefined;
}

function asStringArray(val: unknown): string[] {
	if (!Array.isArray(val)) return [];
	return val.filter((v): v is string => typeof v === 'string');
}

function parseTools(raw: unknown): SkillDefinition['tools'] {
	if (!raw || typeof raw !== 'object') return undefined;
	const obj = raw as Record<string, unknown>;
	return {
		builtin: asStringArray(obj.builtin),
		mcp: asStringArray(obj.mcp),
	};
}

function parseModel(raw: unknown): SkillDefinition['model'] {
	if (!raw || typeof raw !== 'object') return undefined;
	const obj = raw as Record<string, unknown>;
	const result: SkillDefinition['model'] = {};
	if (typeof obj.recommended === 'string') result.recommended = obj.recommended;
	if (obj.minCapabilities && typeof obj.minCapabilities === 'object') {
		result.minCapabilities = {};
		for (const [k, v] of Object.entries(obj.minCapabilities as Record<string, unknown>)) {
			if (typeof v === 'boolean') result.minCapabilities[k] = v;
		}
	}
	if (obj.outputControl && typeof obj.outputControl === 'object') {
		const oc = obj.outputControl as Record<string, unknown>;
		result.outputControl = {};
		if (typeof oc.temperature === 'number') result.outputControl.temperature = oc.temperature;
		if (typeof oc.reasoningEffort === 'string') {
			result.outputControl.reasoningEffort = oc.reasoningEffort as 'low' | 'medium' | 'high';
		}
	}
	return result;
}

function parseInputs(raw: unknown): SkillInput[] | undefined {
	if (!Array.isArray(raw)) return undefined;
	return raw
		.filter((item): item is Record<string, unknown> => item != null && typeof item === 'object')
		.map((item) => ({
			name: typeof item.name === 'string' ? item.name : '',
			type: (typeof item.type === 'string' ? item.type : 'text') as SkillInput['type'],
			description: typeof item.description === 'string' ? item.description : '',
			required: typeof item.required === 'boolean' ? item.required : false,
			default: typeof item.default === 'string' ? item.default : undefined,
		}));
}

function parsePhases(raw: unknown, filePath?: string): SkillPhase[] | undefined {
	if (!Array.isArray(raw)) return undefined;
	return raw
		.filter((item): item is Record<string, unknown> => item != null && typeof item === 'object')
		.map((item) => {
			const name = typeof item.name === 'string' ? item.name : '';
			const prompt = typeof item.prompt === 'string' ? item.prompt : '';
			const tools = parseTools(item.tools) ?? { builtin: [], mcp: [] };
			return { name, tools, prompt };
		});
}
