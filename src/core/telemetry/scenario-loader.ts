/**
 * Scenario YAML loader and validator.
 *
 * A scenario file is a minimal declarative specification of "one trace run":
 *   agent (required)     — which agent to invoke
 *   fixture (required)   — which fixture vault subdirectory to mount (CLI track)
 *   query (required)     — the prompt string
 *   intent (required)    — human-readable description of what the scenario tests
 *   profile (optional)   — profile id override
 *
 * Forbidden fields (throw on presence): `expect`, `assert`, `golden`, `deadline`.
 * Per the design spec, this catalog is for observation, not assertion.
 */

import * as fs from 'node:fs';
import * as path from 'node:path';
import { parse as parseYaml } from 'yaml';

export interface ScenarioDefinition {
    name: string;
    agent: string;
    fixture: string;
    query: string;
    intent: string;
    profile?: string;
}

const REQUIRED_FIELDS: Array<keyof ScenarioDefinition> = ['agent', 'fixture', 'query', 'intent'];
const FORBIDDEN_FIELDS = ['expect', 'assert', 'golden', 'deadline'];

export function parseScenario(yamlText: string, name = 'anonymous'): ScenarioDefinition {
    const doc = parseYaml(yamlText);
    if (!doc || typeof doc !== 'object' || Array.isArray(doc)) {
        throw new Error(`Scenario ${name}: root must be a YAML mapping`);
    }
    const obj = doc as Record<string, unknown>;

    for (const field of FORBIDDEN_FIELDS) {
        if (field in obj) {
            throw new Error(
                `Scenario ${name}: forbidden field "${field}" present. ` +
                    `Scenario catalog is for observation, not assertion. ` +
                    `See docs/superpowers/specs/2026-04-12-agent-trace-observability-design.md §3.8.`,
            );
        }
    }

    for (const field of REQUIRED_FIELDS) {
        if (obj[field] == null) {
            throw new Error(`Scenario ${name}: missing required field "${field}"`);
        }
        if (typeof obj[field] !== 'string') {
            throw new Error(`Scenario ${name}: field "${field}" must be a string`);
        }
    }

    return {
        name,
        agent: String(obj.agent),
        fixture: String(obj.fixture),
        query: String(obj.query),
        intent: String(obj.intent),
        profile: typeof obj.profile === 'string' ? obj.profile : undefined,
    };
}

export function loadScenarioFile(filePath: string): ScenarioDefinition {
    const text = fs.readFileSync(filePath, 'utf8');
    const name = path.basename(filePath, path.extname(filePath));
    return parseScenario(text, name);
}
