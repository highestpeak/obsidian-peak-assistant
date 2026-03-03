/**
 * Slot Mermaid test view for mock desktop. Paste Mermaid content to test diagram display.
 */

import React, { useState } from 'react';
import { MermaidMindFlowSection } from '@/ui/view/quick-search/components/ai-analysis-sections/MermaidMindFlowSection';

const DEFAULT_SAMPLE = `flowchart TD
  N1["Query:<br>All my indie development product ideas comprehensive evaluation"]:::verified
  N2["Sub-query:<br>How to understand and decompose the user's demand for 'comprehensive evaluation'?"]:::verified
  N3["Sub-query:<br>Collect and organize all indie product ideas mentioned by the user"]:::thinking
  N4["Sub-query:<br>Determine the evaluation standards and dimensions"]:::verified
  N1 -->|"main: leads to"| N2
  N1 -->|"main: leads to"| N3
  N1 -->|"main: leads to"| N4
`;

export const MindFlowTestView: React.FC = () => {
	const [content, setContent] = useState(DEFAULT_SAMPLE);

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
					Slot Mermaid Test
				</h2>
				<p style={{ margin: 0, fontSize: 12, color: '#666' }}>
					Paste Mermaid flowchart to test diagram display.
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
				<div style={{ flex: 1, minHeight: 0, overflow: 'auto' }}>
					{content.trim() ? (
						<MermaidMindFlowSection
							mindflowMermaid={content.trim()}
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
