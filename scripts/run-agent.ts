#!/usr/bin/env node
/**
 * CLI harness: run an agent against a fixture vault and write a trace.
 *
 * Usage:
 *   npm run trace -- scenario vault-search/hub-discovery
 *   npm run trace -- vault-search --fixture small "free form query text"
 *   npm run trace -- scenario vault-search/hub-discovery --tool-cap 0
 *
 * Environment:
 *   PEAK_TRACE_TOOL_CAP  — override tool output cap in bytes (0 = disabled)
 *   ANTHROPIC_API_KEY    — required by Agent SDK at execution time
 */

import * as path from 'node:path';
import { query } from '@anthropic-ai/claude-agent-sdk';
import { loadScenarioFile } from '@/core/telemetry/scenario-loader';
import type { ScenarioDefinition } from '@/core/telemetry/scenario-loader';
import { TraceSink } from '@/core/telemetry/traceSink';
import { DEFAULT_TOOL_CAP_BYTES } from '@/core/telemetry/truncate-tool-output';
import { createFsVaultMcpServer } from '@/core/telemetry/fs-vault-mcp/server';

interface CliArgs {
    mode: 'scenario' | 'free';
    scenarioPath?: string;
    freeAgent?: string;
    freeFixture?: string;
    freeQuery?: string;
    profile?: string;
    toolCap: number;
}

const REPO_ROOT = path.resolve(__dirname, '..');
const TRACES_ROOT = path.join(REPO_ROOT, 'data', 'traces');
const FIXTURES_ROOT = path.join(REPO_ROOT, 'test', 'fixtures', 'vault');
const SCENARIOS_ROOT = path.join(REPO_ROOT, 'test', 'scenarios');

async function main(): Promise<void> {
    const args = parseArgs(process.argv.slice(2));
    const scenario = resolveScenario(args);

    const fixtureRoot = path.join(FIXTURES_ROOT, scenario.fixture);
    const fsVaultServer = createFsVaultMcpServer({ rootDir: fixtureRoot });

    const sink = new TraceSink({
        rootDir: TRACES_ROOT,
        agentName: scenario.agent,
        scenarioName: scenario.name,
        intent: scenario.intent,
        profileId: scenario.profile ?? 'default',
        fixture: scenario.fixture,
        track: 'cli',
        toolCapBytes: args.toolCap,
    });

    let errored = false;
    try {
        const iter = query({
            prompt: scenario.query,
            options: {
                mcpServers: { 'fs-vault': fsVaultServer },
                model: scenario.profile ?? process.env.PEAK_PROFILE_MODEL ?? 'claude-opus-4-6',
            },
        });
        for await (const msg of iter) {
            sink.consume(msg);
            echoOneLiner(msg);
        }
    } catch (err) {
        errored = true;
        const message = err instanceof Error ? err.message : String(err);
        sink.finalizeWithError(message);
        process.stderr.write(`trace: agent run failed: ${message}\n`);
    }

    const { metaPath, fullPath } = sink.flush();
    process.stdout.write(`TRACE: ${metaPath}\n`);
    process.stdout.write(`TRACE_FULL: ${fullPath}\n`);
    process.exit(errored ? 1 : 0);
}

function parseArgs(argv: string[]): CliArgs {
    let toolCap = Number(process.env.PEAK_TRACE_TOOL_CAP ?? DEFAULT_TOOL_CAP_BYTES);
    if (!Number.isFinite(toolCap)) toolCap = DEFAULT_TOOL_CAP_BYTES;

    const positional: string[] = [];
    for (let i = 0; i < argv.length; i++) {
        const a = argv[i];
        if (a === '--tool-cap') {
            toolCap = Number(argv[++i]);
            continue;
        }
        if (a === '--fixture') {
            positional.push('--fixture', argv[++i]);
            continue;
        }
        if (a === '--profile') {
            positional.push('--profile', argv[++i]);
            continue;
        }
        positional.push(a);
    }

    if (positional[0] === 'scenario') {
        const scenarioId = positional[1];
        if (!scenarioId) throw new Error('Usage: npm run trace -- scenario <agent>/<name>');
        const scenarioPath = path.join(SCENARIOS_ROOT, `${scenarioId}.yaml`);
        return { mode: 'scenario', scenarioPath, toolCap };
    }

    // Free-form mode: <agent> [--fixture <name>] [--profile <id>] "<query>"
    const freeAgent = positional[0];
    if (!freeAgent) throw new Error('Usage: npm run trace -- <agent> [--fixture <name>] "<query>"');
    let freeFixture = 'small';
    let profile: string | undefined;
    const rest: string[] = [];
    for (let i = 1; i < positional.length; i++) {
        if (positional[i] === '--fixture') {
            freeFixture = positional[++i];
        } else if (positional[i] === '--profile') {
            profile = positional[++i];
        } else {
            rest.push(positional[i]);
        }
    }
    const freeQuery = rest.join(' ');
    if (!freeQuery) throw new Error('Free-form mode requires a query string after the agent name');
    return { mode: 'free', freeAgent, freeFixture, freeQuery, profile, toolCap };
}

function resolveScenario(args: CliArgs): ScenarioDefinition {
    if (args.mode === 'scenario') {
        return loadScenarioFile(args.scenarioPath!);
    }
    const stamp = Date.now().toString(36);
    return {
        name: `freeform-${stamp}`,
        agent: args.freeAgent!,
        fixture: args.freeFixture!,
        query: args.freeQuery!,
        intent: '(free-form run, no scenario file)',
        profile: args.profile,
    };
}

function echoOneLiner(msg: unknown): void {
    if (!msg || typeof msg !== 'object') return;
    const m = msg as any;
    if (m.type === 'assistant' && Array.isArray(m.message?.content)) {
        for (const block of m.message.content) {
            if (block?.type === 'tool_use') {
                const input = typeof block.input === 'object' ? JSON.stringify(block.input).slice(0, 60) : '';
                process.stdout.write(`[tool] ${block.name} ${input}\n`);
            }
        }
    } else if (m.type === 'result') {
        process.stdout.write(`[result] ${m.subtype} duration=${m.duration_ms}ms\n`);
    }
}

main().catch((err) => {
    process.stderr.write(`trace: fatal: ${err instanceof Error ? err.stack : String(err)}\n`);
    process.exit(2);
});
