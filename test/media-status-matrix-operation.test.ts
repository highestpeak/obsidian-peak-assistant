// Zero-gap E — extended buildMatrixRowInfo covers the operation dimension.
// Existing generate-only rows still return the pre-op behaviour;
// operation:'edit' returns unsupported when the route doesn't advertise it.

import assert from 'assert';
import { buildMatrixRowInfo } from '@/ui/view/settings/tabs/MediaGenerationTab';
import type { MediaKind, MediaOperation } from '@/core/types/media-generation';

type FalSnap = {
	configured: boolean;
	supportedKinds: readonly MediaKind[];
	supportedOperations?: readonly MediaOperation[];
};
type NativeSnap = {
	configured: boolean;
	supportedKinds: readonly MediaKind[];
	supportedOperations?: readonly MediaOperation[];
	reason?: string;
};
type PerKindEntry = { anyRouteReady: boolean; routes: { native: NativeSnap; fal: FalSnap } };

function makeSnapshot(fal: FalSnap, native: NativeSnap): { perKind: Record<'image' | 'video' | 'music', PerKindEntry> } {
	const entry = (): PerKindEntry => ({
		anyRouteReady: (native.configured && native.supportedKinds.length > 0) || (fal.configured && fal.supportedKinds.length > 0),
		routes: { native, fal },
	});
	return { perKind: { image: entry(), video: entry(), music: entry() } };
}

function testGenerateStillReadyWithoutOpField() {
	// Snapshot omits supportedOperations — buildMatrixRowInfo must fall
	// back to ['generate'] and still report Ready.
	const snap = makeSnapshot(
		{ configured: true, supportedKinds: ['image'] },
		{ configured: false, supportedKinds: [] },
	);
	const info = buildMatrixRowInfo({ route: 'fal', kind: 'image', operation: 'generate' }, snap);
	assert.strictEqual(info.configured, true);
	assert.strictEqual(info.supported, true);
	assert.strictEqual(info.reason, undefined);
	console.log('PASS: T1 op default=generate + no supportedOperations → ready');
}

function testEditUnsupportedWithoutOpAdvertised() {
	// Fal is configured for image generate but doesn't advertise `edit`.
	const snap = makeSnapshot(
		{ configured: true, supportedKinds: ['image'], supportedOperations: ['generate'] },
		{ configured: false, supportedKinds: [] },
	);
	const info = buildMatrixRowInfo({ route: 'fal', kind: 'image', operation: 'edit' }, snap);
	assert.strictEqual(info.configured, true);
	assert.strictEqual(info.supported, false, 'edit not in supportedOperations → not supported');
	assert.strictEqual(info.reason, 'unsupported-operation');
	console.log('PASS: T2 edit unsupported when supportedOperations omits it');
}

function testEditReadyOnRouteAdvertisingIt() {
	const snap = makeSnapshot(
		{ configured: true, supportedKinds: ['image'], supportedOperations: ['generate', 'edit'] },
		{ configured: false, supportedKinds: [] },
	);
	const info = buildMatrixRowInfo({ route: 'fal', kind: 'image', operation: 'edit' }, snap);
	assert.strictEqual(info.configured, true);
	assert.strictEqual(info.supported, true);
	assert.strictEqual(info.reason, undefined);
	console.log('PASS: T3 edit ready when supportedOperations includes it');
}

function testNativeEditUnsupportedForVideo() {
	// Native advertises image edit only. Asking for video edit must reject.
	const snap = makeSnapshot(
		{ configured: false, supportedKinds: [] },
		{ configured: true, supportedKinds: ['image'], supportedOperations: ['generate', 'edit'] },
	);
	const info = buildMatrixRowInfo({ route: 'native', kind: 'video', operation: 'edit' }, snap);
	assert.strictEqual(info.supported, false);
	console.log('PASS: T4 native edit for video kind is unsupported');
}

testGenerateStillReadyWithoutOpField();
testEditUnsupportedWithoutOpAdvertised();
testEditReadyOnRouteAdvertisingIt();
testNativeEditUnsupportedForVideo();
console.log('All media-status-matrix-operation tests passed');
