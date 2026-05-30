/**
 * Drives the Curator agent. Detects environment, kicks off runCurator, shows
 * a spinner with a cancel affordance, and dispatches the result/error to the
 * wizard state machine on completion.
 */

import React, { useEffect, useRef } from 'react';
import { X } from 'lucide-react';
import { AppContext } from '@/app/context/AppContext';
import { ProfileRegistry } from '@/core/profiles/ProfileRegistry';
import {
    detectEnvironment,
    isCatalogLoaded,
    runCurator,
    buildFallbackRecommendation,
    type CuratorContext,
    type CuratorResult,
    type UserPreferences,
} from '@/service/agents/harness/curator';
import { Pill } from '@/ui/components/primitives';
import type { BootstrapSelection } from './state';
import { useOnboardingStrings } from '@/ui/view/onboarding/onboardingStrings';

export interface RunningCuratorStepProps {
    bootstrap: BootstrapSelection | null;
    preferences: UserPreferences;
    userNote: string;
    error: string | null;
    onSuccess: (result: CuratorResult) => void;
    onError: (message: string) => void;
    onCancel: () => void;
}

export function RunningCuratorStep({
    bootstrap,
    preferences,
    userNote,
    error,
    onSuccess,
    onError,
    onCancel,
}: RunningCuratorStepProps) {
    const strings = useOnboardingStrings();
    const copy = strings.steps.running;
    const onSuccessRef = useRef(onSuccess);
    const onErrorRef = useRef(onError);
    const stringsRef = useRef(strings);
    useEffect(() => {
        onSuccessRef.current = onSuccess;
        onErrorRef.current = onError;
        stringsRef.current = strings;
    });

    useEffect(() => {
        if (!bootstrap) {
            onErrorRef.current(stringsRef.current.steps.running.bootstrapMissingError);
            return;
        }

        const controller = new AbortController();

        async function run(bs: BootstrapSelection): Promise<void> {
            try {
                const app = AppContext.getInstance().app;
                const env = await detectEnvironment({ app });
                const ctx: CuratorContext = { env, preferences };
                if (!isCatalogLoaded()) {
                    onErrorRef.current(stringsRef.current.steps.running.catalogUnavailableError);
                    const recommendation = buildFallbackRecommendation(ctx);
                    onSuccessRef.current({ recommendation, fromLLM: false, attempts: [] });
                    return;
                }
                const profile = ProfileRegistry.getInstance().getProfileById(bs.profileId);
                if (!profile) {
                    onErrorRef.current(stringsRef.current.steps.running.profileGoneError);
                    return;
                }
                const result = await runCurator({
                    ctx,
                    bootstrap: { profile, modelId: bs.modelId },
                    userFollowup: userNote.trim() ? userNote.trim() : undefined,
                    signal: controller.signal,
                });
                if (controller.signal.aborted) return;
                onSuccessRef.current(result);
            } catch (e) {
                if (controller.signal.aborted) return;
                onErrorRef.current(e instanceof Error ? e.message : String(e));
            }
        }

        void run(bootstrap);
        return () => controller.abort();
    }, [bootstrap, preferences, userNote]);

    return (
        <div className="pkonb-hero">
            <span className="pkonb-spinner" />
            <span className="pkonb-hero__title">{copy.title}</span>
            <span className="pkonb-hero__sub">{copy.description}</span>
            {error && (
                <div className="pkonb-hint pkonb-hint--danger" style={{ maxWidth: 420 }}>
                    <span>{error}</span>
                </div>
            )}
            <Pill onClick={onCancel}>
                <X />
                <span>{copy.cancelCta}</span>
            </Pill>
        </div>
    );
}
