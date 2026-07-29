import { spawn, type ChildProcess } from 'child_process';
import { createServer } from 'http';
import path from 'path';
import type { HttpClientPort } from '@/core/ports/HttpClientPort';

export interface RunningSimulatorSidecar {
	port: number;
	baseUrl: string;
	process: ChildProcess;
	stop(): Promise<void>;
}

export async function startSimulatorSidecar(
	options: { quiet?: boolean } = {},
): Promise<RunningSimulatorSidecar> {
	const port = await getFreePort();
	const child = spawn(
		process.execPath,
		[path.join(process.cwd(), 'tools/ai-search-simulator/server.mjs')],
		{
			cwd: process.cwd(),
			env: {
				...process.env,
				PEAK_SIMULATOR_PORT: String(port),
				PEAK_SIMULATOR_QUIET: options.quiet === false ? '0' : '1',
			},
			stdio: ['ignore', 'pipe', 'pipe'],
		},
	);
	let stderr = '';
	child.stderr?.on('data', (chunk) => { stderr += String(chunk); });
	for (let attempt = 0; attempt < 50; attempt += 1) {
		if (child.exitCode != null) {
			throw new Error(`Simulator exited during startup: ${stderr}`);
		}
		try {
			const response = await fetch(`http://127.0.0.1:${port}/health`);
			if (response.ok) {
				return {
					port,
					baseUrl: `http://127.0.0.1:${port}/v1`,
					process: child,
					stop: () => stopSidecar(child),
				};
			}
		} catch {
			// The process is still starting.
		}
		await new Promise((resolve) => setTimeout(resolve, 50));
	}
	child.kill('SIGTERM');
	throw new Error(`Simulator did not become ready: ${stderr}`);
}

export function simulatorFetchHttpClient(): HttpClientPort {
	return {
		request: async (request) => {
			const response = await fetch(request.url, {
				method: request.method,
				headers: request.headers,
				body: request.body,
			});
			const arrayBuffer = await response.arrayBuffer();
			return {
				status: response.status,
				headers: Object.fromEntries(response.headers.entries()),
				text: new TextDecoder().decode(arrayBuffer),
				arrayBuffer,
			};
		},
	};
}

async function getFreePort(): Promise<number> {
	const server = createServer();
	await new Promise<void>((resolve, reject) => {
		server.once('error', reject);
		server.listen(0, '127.0.0.1', resolve);
	});
	const address = server.address();
	const port = typeof address === 'object' && address ? address.port : 0;
	await new Promise<void>((resolve, reject) => {
		server.close((error) => error ? reject(error) : resolve());
	});
	return port;
}

async function stopSidecar(child: ChildProcess): Promise<void> {
	if (child.exitCode != null) return;
	await new Promise<void>((resolve) => {
		child.once('exit', () => resolve());
		child.kill('SIGTERM');
	});
}
