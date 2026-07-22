// Catalog capability annotations (gap 4+5). Locks the fact that Gemini
// 1.5+ / 2.x models declare audioInput=true AND videoInput=true (so the
// understanding gate correctly bypasses transcription), while OpenAI and
// Claude default models do not — a preflight guard against silent
// regressions during catalog edits.

import assert from 'assert';
import { resolveModelCapabilities } from '@/core/providers/types';
import geminiCatalog from '../templates/config/models/gemini.json';
import openaiCatalog from '../templates/config/models/openai.json';
import claudeCatalog from '../templates/config/models/claude.json';

function readCapabilities(catalog: any, modelId: string) {
	const entry = catalog.models?.[modelId];
	assert.ok(entry, `catalog missing ${modelId}`);
	return resolveModelCapabilities({ capabilities: entry.capabilities });
}

function testGeminiVideoInputMarked() {
	// Every Gemini 1.5+ and 2.x model MUST declare native audio+video input;
	// otherwise MediaUnderstandingRuntime falls back to whisper transcription
	// even for Gemini turns.
	const models = [
		'gemini-2.5-pro',
		'gemini-2.5-flash',
		'gemini-2.0-flash',
		'gemini-2.0-flash-lite',
		'gemini-2.0-flash-thinking',
		'gemini-1.5-pro',
		'gemini-1.5-flash',
		'gemini-1.5-flash-8b',
	];
	for (const id of models) {
		const caps = readCapabilities(geminiCatalog, id);
		assert.strictEqual(caps.videoInput, true, `${id} must declare videoInput=true`);
		assert.strictEqual(caps.audioInput, true, `${id} must declare audioInput=true`);
	}
	console.log('PASS: model-catalog-media-caps gemini has audio+video input');
}

function testOpenAIDefaultsNoAudioVideo() {
	// GPT-4o / o1 do NOT accept audio or video parts in Chat Completions
	// (only the audio-preview variant does, which is not in the catalog).
	// Being conservative — only annotate what's confirmed.
	const caps = readCapabilities(openaiCatalog, 'gpt-4o');
	assert.strictEqual(caps.audioInput, false, 'gpt-4o must not claim audioInput');
	assert.strictEqual(caps.videoInput, false, 'gpt-4o must not claim videoInput');
	const capsMini = readCapabilities(openaiCatalog, 'gpt-4o-mini');
	assert.strictEqual(capsMini.audioInput, false);
	assert.strictEqual(capsMini.videoInput, false);
	console.log('PASS: model-catalog-media-caps openai defaults stay off');
}

function testClaudeNoAudioVideo() {
	// Claude Sonnet/Opus/Haiku never accept audio/video — image + PDF only.
	const modelIds = Object.keys(claudeCatalog.models ?? {});
	assert.ok(modelIds.length > 0, 'claude catalog must not be empty');
	for (const id of modelIds) {
		const caps = readCapabilities(claudeCatalog, id);
		assert.strictEqual(caps.audioInput, false, `claude/${id} must not claim audioInput`);
		assert.strictEqual(caps.videoInput, false, `claude/${id} must not claim videoInput`);
	}
	console.log('PASS: model-catalog-media-caps claude stays audio/video-off');
}

testGeminiVideoInputMarked();
testOpenAIDefaultsNoAudioVideo();
testClaudeNoAudioVideo();
