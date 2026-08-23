import React, { useEffect, useState } from 'react';
import { Check, ChevronDown, Clipboard, LoaderCircle, TriangleAlert, XCircle } from 'lucide-react';
import type { DebugModelCall, DebugPayload, DebugTracePort } from '@/core/debug-trace';
import { Button } from '@/ui/components/primitives';

export function AiCallDiagnostics({ port }: { port: DebugTracePort | null }) {
	const [calls, setCalls] = useState<DebugModelCall[]>(() => port?.listModelCalls(50) ?? []);
	useEffect(() => {
		setCalls(port?.listModelCalls(50) ?? []);
		if (!port) return;
		return port.subscribe(() => setCalls(port.listModelCalls(50)));
	}, [port]);

	if (!port || port.currentMode() === 'off') {
		return <div className="pk-ai-call-log pk-ai-call-log--empty">AI call logging is off.</div>;
	}
	if (calls.length === 0) {
		return <div className="pk-ai-call-log pk-ai-call-log--empty">No AI calls in this plugin session yet.</div>;
	}
	return <div className="pk-ai-call-log" aria-label="Recent AI calls">
		{calls.map((call) => <AiCallRow key={call.callId} call={call} />)}
	</div>;
}

function AiCallRow({ call }: { call: DebugModelCall }) {
	const [copied, setCopied] = useState(false);
	const copy = async () => {
		await navigator.clipboard.writeText(JSON.stringify(call, null, 2));
		setCopied(true);
		window.setTimeout(() => setCopied(false), 1200);
	};
	return <details className={`pk-ai-call pk-ai-call--${call.phase}`}>
		<summary>
			<span className="pk-ai-call__status">{statusIcon(call)}<span>{statusLabel(call)}</span></span>
			<span className="pk-ai-call__identity"><strong>{call.capabilityId}</strong><small>{call.operation} · {durationLabel(call)}</small></span>
			<span className="pk-ai-call__route">{call.providerId} / {call.modelId}</span>
			<ChevronDown size={14} className="pk-ai-call__chevron" />
		</summary>
		<div className="pk-ai-call__body">
			{call.error ? <div className="pk-ai-call__error"><strong>{call.error.message}</strong>{call.error.stack ? <pre>{call.error.stack}</pre> : null}</div> : null}
			<PayloadBlock label="Request" payload={call.request} />
			<PayloadBlock label="Response" payload={call.response} empty="No response captured." />
			{call.reasoning ? <PayloadBlock label="Provider reasoning" payload={call.reasoning} /> : null}
			<div className="pk-ai-call__facts">
				{call.finishReason ? <span>Finish: <strong>{call.finishReason}</strong></span> : null}
				{Object.entries(call.metrics ?? {}).map(([key, value]) => <span key={key}>{key}: <strong>{value}</strong></span>)}
			</div>
			<div className="pk-ai-call__actions"><Button variant="secondary" onClick={() => void copy()}>{copied ? <Check size={14} /> : <Clipboard size={14} />}{copied ? 'Copied' : 'Copy record'}</Button></div>
		</div>
	</details>;
}

function PayloadBlock({ label, payload, empty }: { label: string; payload?: DebugPayload; empty?: string }) {
	const body = payload?.raw ?? payload?.excerpt ?? empty ?? '';
	return <div className="pk-ai-call__payload">
		<span><strong>{label}</strong>{payload ? <small>{payload.length} chars · {payload.contentHash}</small> : null}</span>
		<pre>{body}</pre>
	</div>;
}

function statusIcon(call: DebugModelCall) {
	if (call.phase === 'failed') return <XCircle size={15} />;
	if (call.phase === 'cancelled') return <TriangleAlert size={15} />;
	if (call.phase === 'response') return <Check size={15} />;
	return <LoaderCircle size={15} className="pk-spin" />;
}

function statusLabel(call: DebugModelCall): string {
	if (call.phase === 'request') return 'Sending';
	if (call.phase === 'streaming') return 'Streaming';
	if (call.phase === 'response') return 'Complete';
	if (call.phase === 'failed') return 'Failed';
	return 'Cancelled';
}

function durationLabel(call: DebugModelCall): string {
	const duration = call.durationMs ?? Math.max(0, Date.now() - call.startedAt);
	if (duration < 1000) return `${duration}ms`;
	return `${(duration / 1000).toFixed(1)}s`;
}
