import {
	composerVirtualViewportIsCovered,
	composerVirtualViewportNeedsRecenter,
	decideComposerVirtualProjection,
	emergencyComposerVirtualViewport,
	initialComposerVirtualViewport,
	sampleComposerVirtualViewport,
	settledComposerVirtualViewport,
} from '@/ui/view/composer/virtualization/ComposerVirtualScrollPolicy';
import { DEFAULT_COMPOSER_VIRTUALIZATION_CONFIG } from '@/ui/view/composer/config/composerConfig';

let failures = 0;
let checks = 0;
function check(name: string, condition: boolean, detail = ''): void {
	checks += 1;
	if (condition) return;
	failures += 1;
	console.error(`  XX ${name}${detail ? ` — ${detail}` : ''}`);
}

function main(): void {
	const config = DEFAULT_COMPOSER_VIRTUALIZATION_CONFIG;
	const initial = initialComposerVirtualViewport(config);
	const sampled = sampleComposerVirtualViewport(initial, {
		start: 3_090,
		height: 900,
		sampledAtMs: 196,
	});
	check('scroll sampling never grows the mounted window', sampled.overscanAfter === config.overscanPx);
	check('scroll sampling preserves the existing trailing buffer', sampled.overscanBefore === config.overscanPx);
	const emergency = emergencyComposerVirtualViewport(sampled, config);
	check('escaped viewport uses the minimal synchronous buffer', emergency.overscanAfter === config.emergencyOverscanPx);
	check('emergency buffer is smaller than settled overscan', emergency.overscanBefore < config.overscanPx);
	const settled = settledComposerVirtualViewport(emergency, config);
	check('idle projection restores ordinary overscan', settled.overscanBefore === config.overscanPx);

	check(
		'covered viewport may wait for the scheduled frame',
		composerVirtualViewportIsCovered(
			{ start: 1_000, height: 900 },
			{ start: 100, end: 2_000, documentEnd: 10_000 },
		),
	);
	check(
		'viewport beyond mounted coverage requires emergency projection',
		!composerVirtualViewportIsCovered(
			{ start: 2_001, height: 900 },
			{ start: 100, end: 2_000, documentEnd: 10_000 },
		),
	);
	check(
		'partial viewport coverage still requires emergency projection',
		!composerVirtualViewportIsCovered(
			{ start: 1_500, height: 900 },
			{ start: 100, end: 2_000, documentEnd: 10_000 },
		),
	);
	check(
		'tail coverage treats space below the last document row as covered',
		composerVirtualViewportIsCovered(
			{ start: 9_500, height: 900 },
			{ start: 8_000, end: 10_000, documentEnd: 10_000 },
		),
	);
	const coverage = { start: 1_000, end: 4_000, documentEnd: 10_000 };
	check(
		'centered viewport does not request a React recenter',
		!composerVirtualViewportNeedsRecenter({ start: 2_000, height: 900 }, coverage, 360),
	);
	check(
		'forward edge requests deferred recentering',
		composerVirtualViewportNeedsRecenter({ start: 2_800, height: 900 }, coverage, 360),
	);
	check(
		'reverse edge requests deferred recentering',
		composerVirtualViewportNeedsRecenter({ start: 1_200, height: 900 }, coverage, 360),
	);
	check(
		'document start does not request impossible backward recentering',
		!composerVirtualViewportNeedsRecenter(
			{ start: 0, height: 900 },
			{ start: 0, end: 2_000, documentEnd: 10_000 },
			360,
		),
	);
	check(
		'centered covered scroll performs no React projection',
		decideComposerVirtualProjection({ start: 2_000, height: 900 }, coverage, 360) === 'none',
	);
	check(
		'near-edge covered scroll requests only deferred recentering',
		decideComposerVirtualProjection({ start: 2_800, height: 900 }, coverage, 360) === 'recenter',
	);
	check(
		'escaped scroll requests emergency projection',
		decideComposerVirtualProjection({ start: 4_100, height: 900 }, coverage, 360) === 'emergency',
	);

	console.log(`composer-virtual-scroll-policy: ${checks - failures}/${checks} checks passed`);
	if (failures > 0) throw new Error(`${failures} check(s) failed`);
}

main();
