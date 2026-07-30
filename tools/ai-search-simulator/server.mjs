#!/usr/bin/env node

import { randomUUID } from 'node:crypto';
import { createServer } from 'node:http';
import { pathToFileURL } from 'node:url';
import {
	resolveSimulatorIntent,
	SIMULATOR_CONFIG,
	simulatorChunkDelayMs,
	simulatorConfigFromHeaders,
	simulatorDelayMs,
	splitSimulatorText,
} from './scenario-engine.mjs';

export function createSimulatorServer(options = {}) {
	const host = options.host ?? process.env.PEAK_SIMULATOR_HOST ?? SIMULATOR_CONFIG.server.host;
	const port = Number(
		options.port
		?? process.env.PEAK_SIMULATOR_PORT
		?? SIMULATOR_CONFIG.server.port,
	);
	const quiet = options.quiet ?? process.env.PEAK_SIMULATOR_QUIET === '1';
	const server = createServer(async (request, response) => {
		const startedAt = Date.now();
		const requestId = headerValue(request.headers, 'x-peak-simulator-run-id') ?? randomUUID();
		setCorsHeaders(response);

		try {
			if (request.method === 'OPTIONS') {
				response.writeHead(204);
				response.end();
				return;
			}

			const url = new URL(request.url ?? '/', `http://${host}:${port}`);
			if (!quiet) {
				console.log(`[AI Search Simulator] ${requestId} ${request.method} ${url.pathname}`);
			}
			if (
				request.method === 'HEAD'
				&& (url.pathname === '/' || url.pathname === '/v1')
			) {
				response.writeHead(200);
				response.end();
				return;
			}
			if (request.method === 'GET') {
				handleGet(url.pathname, response);
				return;
			}

			if (request.method !== 'POST') {
				writeJson(response, 405, { error: 'Method not allowed' });
				return;
			}

			const body = await readJsonBody(request, SIMULATOR_CONFIG.server.maxRequestBytes);
			const config = simulatorConfigFromHeaders(request.headers);
			if (url.pathname !== '/v1/chat/completions') {
				writeJson(response, 404, { error: 'Unknown Simulator endpoint' });
				return;
			}

			const normalized = normalizeOpenAIRequest(body);
			const intent = resolveSimulatorIntent({ ...normalized, config });
			if (!quiet) {
				console.log(
					`[AI Search Simulator] ${requestId} openai-chat`
					+ ` scenario=${config.scenario} intent=${intent.kind}`,
				);
			}
			if (intent.kind === 'error') {
				writeSimulatorError(response, intent.message);
				return;
			}

			const delayMs = simulatorDelayMs(config);
			await writeOpenAIResponse(response, body, intent, delayMs, requestId);
		} catch (error) {
			const message = error instanceof Error ? error.message : String(error);
			if (!response.headersSent) writeJson(response, 400, { error: message });
			else response.destroy(error instanceof Error ? error : undefined);
			if (!quiet) console.error(`[AI Search Simulator] ${requestId} failed: ${message}`);
		} finally {
			if (!quiet && response.writableEnded) {
				console.log(`[AI Search Simulator] ${requestId} completed in ${Date.now() - startedAt}ms`);
			}
		}
	});

	return {
		host,
		port,
		server,
		listen: () => new Promise((resolve, reject) => {
			server.once('error', reject);
			server.listen(port, host, () => {
				server.off('error', reject);
				const address = server.address();
				const actualPort = typeof address === 'object' && address ? address.port : port;
				resolve({ host, port: actualPort });
			});
		}),
		close: () => new Promise((resolve, reject) => {
			server.close((error) => error ? reject(error) : resolve());
		}),
	};
}

function handleGet(pathname, response) {
	if (pathname === '/health' || pathname === '/v1/health') {
		writeJson(response, 200, {
			ok: true,
			service: SIMULATOR_CONFIG.server.serviceName,
			model: SIMULATOR_CONFIG.server.modelId,
			protocols: ['openai-chat'],
		});
		return;
	}

	if (pathname === '/v1/scenarios') {
		writeJson(response, 200, {
			scenarios: SIMULATOR_CONFIG.scenarios,
			speeds: SIMULATOR_CONFIG.speeds,
		});
		return;
	}

	if (pathname === '/v1/models') {
		writeJson(response, 200, {
			object: 'list',
			data: [{
				id: SIMULATOR_CONFIG.server.modelId,
				object: 'model',
				owned_by: SIMULATOR_CONFIG.server.serviceName,
			}],
		});
		return;
	}

	writeJson(response, 404, { error: 'Unknown Simulator endpoint' });
}

function normalizeOpenAIRequest(body) {
	const toolNames = new Map();
	const toolResults = [];
	const text = [];

	for (const message of body.messages ?? []) {
		if (typeof message.content === 'string') text.push(message.content);
		if (Array.isArray(message.content)) {
			for (const block of message.content) {
				if (typeof block?.text === 'string') text.push(block.text);
			}
		}
		for (const toolCall of message.tool_calls ?? []) {
			if (toolCall?.id && toolCall?.function?.name) {
				toolNames.set(toolCall.id, toolCall.function.name);
			}
		}
		if (message.role !== 'tool') continue;
		const toolName = message.name ?? toolNames.get(message.tool_call_id);
		if (!toolName) continue;
		toolResults.push({ toolName, value: parseMaybeJson(message.content) });
	}

	return {
		text: text.join('\n'),
		availableTools: (body.tools ?? [])
			.map((tool) => tool?.function?.name)
			.filter((name) => typeof name === 'string'),
		toolResults,
	};
}

async function writeOpenAIResponse(response, body, intent, delayMs, requestId) {
	const model = body.model ?? SIMULATOR_CONFIG.server.modelId;
	const id = `chatcmpl-${requestId}`;
	if (!body.stream) {
		await wait(delayMs, response);
		const message = intent.kind === 'tool-call'
			? {
				role: 'assistant',
				content: null,
				tool_calls: [{
					id: `call-${requestId}`,
					type: 'function',
					function: { name: intent.toolName, arguments: JSON.stringify(intent.input) },
				}],
			}
			: { role: 'assistant', content: intent.text };
		writeJson(response, 200, {
			id,
			object: 'chat.completion',
			created: unixSeconds(),
			model,
			choices: [{
				index: 0,
				message,
				finish_reason: intent.kind === 'tool-call' ? 'tool_calls' : 'stop',
			}],
			usage: openAIUsage(),
		});
		return;
	}

	startSse(response);
	await wait(delayMs, response);
	writeSse(response, {
		id,
		object: 'chat.completion.chunk',
		created: unixSeconds(),
		model,
		choices: [{ index: 0, delta: { role: 'assistant' }, finish_reason: null }],
	});
	if (intent.kind === 'tool-call') {
		writeSse(response, {
			id,
			object: 'chat.completion.chunk',
			created: unixSeconds(),
			model,
			choices: [{
				index: 0,
				delta: {
					tool_calls: [{
						index: 0,
						id: `call-${requestId}`,
						type: 'function',
						function: {
							name: intent.toolName,
							arguments: JSON.stringify(intent.input),
						},
					}],
				},
				finish_reason: null,
			}],
		});
	} else {
		for (const chunk of splitSimulatorText(intent.text)) {
			await wait(simulatorChunkDelayMs(delayMs), response);
			writeSse(response, {
				id,
				object: 'chat.completion.chunk',
				created: unixSeconds(),
				model,
				choices: [{ index: 0, delta: { content: chunk }, finish_reason: null }],
			});
		}
	}
	writeSse(response, {
		id,
		object: 'chat.completion.chunk',
		created: unixSeconds(),
		model,
		choices: [{
			index: 0,
			delta: {},
			finish_reason: intent.kind === 'tool-call' ? 'tool_calls' : 'stop',
		}],
	});
	writeSse(response, {
		id,
		object: 'chat.completion.chunk',
		created: unixSeconds(),
		model,
		choices: [],
		usage: openAIUsage(),
	});
	response.write('data: [DONE]\n\n');
	response.end();
}

function writeSimulatorError(response, message) {
	writeJson(response, 500, {
		error: { type: 'simulator_error', code: 'simulator_scenario', message },
	});
}

function openAIUsage() {
	return {
		prompt_tokens: SIMULATOR_CONFIG.usage.inputTokens,
		completion_tokens: SIMULATOR_CONFIG.usage.outputTokens,
		total_tokens: SIMULATOR_CONFIG.usage.inputTokens + SIMULATOR_CONFIG.usage.outputTokens,
	};
}

async function readJsonBody(request, maxBytes) {
	const chunks = [];
	let size = 0;
	for await (const chunk of request) {
		size += chunk.length;
		if (size > maxBytes) throw new Error('Simulator request body is too large');
		chunks.push(chunk);
	}
	const text = Buffer.concat(chunks).toString('utf8');
	if (!text) return {};
	return JSON.parse(text);
}

function parseMaybeJson(value) {
	if (typeof value !== 'string') return value;
	try {
		return JSON.parse(value);
	} catch {
		return value;
	}
}

function setCorsHeaders(response) {
	response.setHeader('access-control-allow-origin', '*');
	response.setHeader(
		'access-control-allow-headers',
		'authorization, content-type, x-api-key, x-peak-simulator-scenario,'
		+ ' x-peak-simulator-speed,'
		+ ' x-peak-simulator-strict, x-peak-simulator-run-id',
	);
	response.setHeader('access-control-allow-methods', 'GET, POST, OPTIONS');
}

function startSse(response) {
	response.writeHead(200, {
		'content-type': 'text/event-stream',
		'cache-control': 'no-cache',
		connection: 'keep-alive',
	});
}

function writeSse(response, value, event) {
	if (response.destroyed || response.writableEnded) return;
	if (event) response.write(`event: ${event}\n`);
	response.write(`data: ${JSON.stringify(value)}\n\n`);
}

function writeJson(response, status, value) {
	response.writeHead(status, { 'content-type': 'application/json; charset=utf-8' });
	response.end(JSON.stringify(value));
}

function wait(ms, response) {
	if (ms <= 0 || response.destroyed || response.writableEnded) return Promise.resolve();
	return new Promise((resolve) => {
		const finish = () => {
			clearTimeout(timer);
			response.off('close', finish);
			resolve();
		};
		const timer = setTimeout(finish, ms);
		response.once('close', finish);
	});
}

function headerValue(headers, name) {
	const value = headers[name];
	if (Array.isArray(value)) return value[0];
	return typeof value === 'string' ? value : null;
}

function unixSeconds() {
	return Math.floor(Date.now() / 1000);
}

function isMainModule() {
	if (!process.argv[1]) return false;
	return pathToFileURL(process.argv[1]).href === import.meta.url;
}

if (isMainModule()) {
	const simulator = createSimulatorServer();
	simulator.listen()
		.then(({ host, port }) => {
			console.log(`[AI Search Simulator] listening on http://${host}:${port}`);
			console.log('[AI Search Simulator] protocol: OpenAI Chat');
		})
		.catch((error) => {
			console.error(`[AI Search Simulator] failed to start: ${error.message}`);
			process.exitCode = 1;
		});

	const shutdown = async () => {
		try {
			await simulator.close();
		} finally {
			process.exit(0);
		}
	};
	process.once('SIGINT', shutdown);
	process.once('SIGTERM', shutdown);
}
