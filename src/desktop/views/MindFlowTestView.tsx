/**
 * MindFlow Mermaid test view for mock desktop. Paste Mermaid content and
 * MindflowProgress JSON to test diagram + progress display.
 */

import React, { useState, useMemo } from 'react';
import { MermaidMindFlowSection } from '@/ui/view/quick-search/components/ai-analysis-sections/MermaidMindFlowSection';
import type { MindflowProgress } from '@/service/agents/search-agent-helper/MindFlowAgent';

const DEFAULT_SAMPLE = `flowchart TD
  N1["Query:<br>All my indie development product ideas comprehensive evaluation"]:::verified
  N2["Sub-query:<br>How to understand and decompose the user's demand for 'comprehensive evaluation'?"]:::verified
  N3["Sub-query:<br>Collect and整理用户提到的所有独立开发产品 idea"]:::thinking
  N4["Sub-query:<br>Determine the evaluation standards and dimensions"]:::verified
  N1 -->|"main: leads to"| N2
  N1 -->|"main: leads to"| N3
  N1 -->|"main: leads to"| N4
`;

const DEFAULT_PROGRESS_JSON = `{
  "estimatedCompleteness": 45,
  "statusLabel": "Deepening hidden clues",
  "goalAlignment": "Sub-questions + verified paths",
  "critique": "Need more evidence for evaluation criteria",
  "decision": "continue"
}`;

function parseProgressJson(json: string): MindflowProgress | null {
	const s = json.trim();
	if (!s) return null;
	try {
		const o = JSON.parse(s) as Record<string, unknown>;
		const completeness = typeof o.estimatedCompleteness === 'number' ? o.estimatedCompleteness : 0;
		const statusLabel = typeof o.statusLabel === 'string' ? o.statusLabel : '';
		const decision = o.decision === 'stop' ? 'stop' as const : 'continue' as const;
		return {
			estimatedCompleteness: completeness,
			statusLabel,
			goalAlignment: typeof o.goalAlignment === 'string' ? o.goalAlignment : undefined,
			critique: typeof o.critique === 'string' ? o.critique : undefined,
			decision,
		};
	} catch {
		return null;
	}
}

export const MindFlowTestView: React.FC = () => {
	const [content, setContent] = useState(DEFAULT_SAMPLE);
	const [progressJson, setProgressJson] = useState(DEFAULT_PROGRESS_JSON);

	const progress = useMemo(() => parseProgressJson(progressJson), [progressJson]);

	return (
		<div style={{ display: 'flex', flexDirection: 'column', height: '100%', overflow: 'hidden' }}>
			<div
				style={{
					flexShrink: 0,
					padding: '12px 16px',
					borderBottom: '1px solid #e5e5e5',
					backgroundColor: '#f8f9fa',
				}}
			>
				<h2 style={{ margin: 0, marginBottom: 8, fontSize: 16, fontWeight: 600 }}>
					MindFlow Mermaid Test
				</h2>
				<p style={{ margin: 0, fontSize: 12, color: '#666' }}>
					Paste Mermaid flowchart and MindflowProgress JSON to test diagram + progress display.
				</p>
			</div>
			<div style={{ flex: 1, display: 'flex', flexDirection: 'column', overflow: 'hidden', padding: 16, gap: 16 }}>
				<div>
					<label style={{ display: 'block', fontSize: 11, fontWeight: 600, color: '#666', marginBottom: 4 }}>
						Mermaid
					</label>
					<textarea
						style={{
							width: '100%',
							height: 120,
							padding: 12,
							border: '1px solid #ddd',
							borderRadius: 8,
							fontFamily: 'monospace',
							fontSize: 12,
							resize: 'none',
						}}
						placeholder="Paste Mermaid content..."
						value={content}
						onChange={(e) => setContent(e.target.value)}
						spellCheck={false}
					/>
				</div>
				<div>
					<label style={{ display: 'block', fontSize: 11, fontWeight: 600, color: '#666', marginBottom: 4 }}>
						MindflowProgress JSON (estimatedCompleteness, statusLabel, goalAlignment, critique, decision)
					</label>
					<textarea
						style={{
							width: '100%',
							height: 100,
							padding: 12,
							border: '1px solid #ddd',
							borderRadius: 8,
							fontFamily: 'monospace',
							fontSize: 11,
							resize: 'none',
						}}
						placeholder='{"estimatedCompleteness": 45, "statusLabel": "...", "decision": "continue"}'
						value={progressJson}
						onChange={(e) => setProgressJson(e.target.value)}
						spellCheck={false}
					/>
				</div>
				<div style={{ flex: 1, minHeight: 0, overflow: 'auto' }}>
					{content.trim() ? (
						<MermaidMindFlowSection
							mindflowMermaid={content.trim()}
							mindflowProgress={progress}
							maxHeightClassName=""
						/>
					) : (
						<div style={{ padding: 24, color: '#999', fontSize: 14 }}>
							Paste Mermaid content above to preview.
						</div>
					)}
				</div>
			</div>
		</div>
	);
};
