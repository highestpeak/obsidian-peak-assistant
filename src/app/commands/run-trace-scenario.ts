/**
 * Obsidian command: Peak: Run Trace Scenario
 *
 * Lists scenarios under test/scenarios/ via a fuzzy-suggest modal, runs the
 * chosen one against the REAL vault (not the fixture), and writes a canonical
 * trace to data/traces/.
 */

import { FuzzySuggestModal, Notice, type App, type Plugin } from 'obsidian';
import * as path from 'node:path';
import * as fs from 'node:fs';
import { loadScenarioFile } from '@/core/telemetry/scenario-loader';
import type { ScenarioDefinition } from '@/core/telemetry/scenario-loader';
import { TraceSink } from '@/core/telemetry/traceSink';
import { DEFAULT_TOOL_CAP_BYTES } from '@/core/telemetry/truncate-tool-output';

/** Resolved at runtime from the plugin's base directory. */
function scenariosRoot(plugin: Plugin): string {
    // @ts-expect-error Obsidian Plugin has manifest.dir at runtime
    const pluginDir = plugin.manifest.dir as string;
    return path.join((plugin.app.vault.adapter as any).basePath, pluginDir, 'test', 'scenarios');
}

function tracesRoot(plugin: Plugin): string {
    // @ts-expect-error Obsidian Plugin has manifest.dir at runtime
    const pluginDir = plugin.manifest.dir as string;
    return path.join((plugin.app.vault.adapter as any).basePath, pluginDir, 'data', 'traces');
}

function listScenarios(root: string): ScenarioDefinition[] {
    const out: ScenarioDefinition[] = [];
    if (!fs.existsSync(root)) return out;
    walkDir(root, (p) => {
        if (!p.endsWith('.yaml')) return;
        try {
            out.push(loadScenarioFile(p));
        } catch (e) {
            console.error('trace scenario load error', p, e);
        }
    });
    return out;
}

function walkDir(dir: string, visit: (p: string) => void): void {
    for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
        const abs = path.join(dir, entry.name);
        if (entry.isDirectory()) walkDir(abs, visit);
        else if (entry.isFile()) visit(abs);
    }
}

class ScenarioPickerModal extends FuzzySuggestModal<ScenarioDefinition> {
    constructor(
        app: App,
        private scenarios: ScenarioDefinition[],
        private onChoose: (s: ScenarioDefinition) => void,
    ) {
        super(app);
    }
    getItems(): ScenarioDefinition[] { return this.scenarios; }
    getItemText(s: ScenarioDefinition): string {
        const intentLine = (s.intent || '').split('\n')[0];
        return `${s.agent}/${s.name} — ${intentLine}`;
    }
    onChooseItem(s: ScenarioDefinition): void { this.onChoose(s); }
}

export function registerRunTraceScenarioCommand(plugin: Plugin): void {
    plugin.addCommand({
        id: 'peak-run-trace-scenario',
        name: 'Peak: Run Trace Scenario',
        callback: async () => {
            const scenarios = listScenarios(scenariosRoot(plugin));
            if (scenarios.length === 0) {
                new Notice('No scenarios found under test/scenarios/');
                return;
            }
            new ScenarioPickerModal(plugin.app, scenarios, async (scenario) => {
                new Notice(`Running trace: ${scenario.agent}/${scenario.name}`);
                const toolCapBytes = DEFAULT_TOOL_CAP_BYTES;

                const sink = new TraceSink({
                    rootDir: tracesRoot(plugin),
                    agentName: scenario.agent,
                    scenarioName: scenario.name,
                    intent: scenario.intent,
                    profileId: scenario.profile ?? 'default',
                    track: 'obsidian',
                    toolCapBytes,
                    // fixture intentionally omitted — this track uses the real vault
                });

                try {
                    // Import dynamically to avoid circular deps at module load
                    const { VaultSearchAgentSDK } = await import('@/service/agents/VaultSearchAgentSDK');
                    const { AppContext } = await import('@/app/context/AppContext');
                    const ctx = AppContext.getInstance();

                    const agent = new VaultSearchAgentSDK({
                        app: plugin.app,
                        pluginId: plugin.manifest.id,
                        searchClient: ctx.searchClient,
                        aiServiceManager: ctx.manager,
                        traceSink: sink,
                    });

                    for await (const _event of agent.startSession(scenario.query)) {
                        // drain events — the TraceSink captures everything via the hook in the loop
                    }
                } catch (err) {
                    const msg = err instanceof Error ? err.message : String(err);
                    sink.finalizeWithError(msg);
                    new Notice(`Trace failed: ${msg}`);
                } finally {
                    const { metaPath } = sink.flush();
                    new Notice(`Trace written: ${metaPath}`);
                    console.log('Trace written:', metaPath);
                }
            }).open();
        },
    });
}
