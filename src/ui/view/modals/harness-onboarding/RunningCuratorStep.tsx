/**
 * Drives the Curator agent. Detects environment, kicks off runCurator, shows
 * a spinner with a cancel affordance, and dispatches the result/error to the
 * wizard state machine on completion.
 *
 * Effect runs once per "started" episode — the parent toggles this step on
 * entry and off when it transitions to review-recommendation.
 */

import React, { useEffect, useRef } from 'react';
import { Loader2, X } from 'lucide-react';
import { Button } from '@/ui/component/shared-ui/button';
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
import type { BootstrapSelection } from './state';

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
    const onSuccessRef = useRef(onSuccess);
    const onErrorRef = useRef(onError);
    useEffect(() => {
        onSuccessRef.current = onSuccess;
        onErrorRef.current = onError;
    });

    useEffect(() => {
        if (!bootstrap) {
            onErrorRef.current('Bootstrap model missing. Go back and select one.');
            return;
        }

        const controller = new AbortController();

        async function run(bs: BootstrapSelection): Promise<void> {
            try {
                const app = AppContext.getInstance().app;
                const env = await detectEnvironment({ app });
                const ctx: CuratorContext = { env, preferences };
                if (!isCatalogLoaded()) {
                    // Catalog hydration runs at boot; if it failed we still want to
                    // give the user a valid (fallback) recommendation rather than
                    // block the wizard.
                    onErrorRef.current('Model catalog unavailable. Using rule-based fallback.');
                    const recommendation = buildFallbackRecommendation(ctx);
                    onSuccessRef.current({ recommendation, fromLLM: false, attempts: [] });
                    return;
                }
                const profile = ProfileRegistry.getInstance().getProfileById(bs.profileId);
                if (!profile) {
                    onErrorRef.current('Selected profile no longer exists. Go back and reselect.');
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
        <div className="pktw-flex pktw-flex-col pktw-items-center pktw-gap-5 pktw-py-10 pktw-px-8">
            <Loader2 size={36} className="pktw-animate-spin pktw-text-[--interactive-accent]" />
            <div className="pktw-text-center pktw-max-w-md">
                <span className="pktw-block pktw-text-base pktw-font-semibold pktw-text-[--text-normal] pktw-mb-1">
                    配置助手正在分析…
                </span>
                <span className="pktw-block pktw-text-xs pktw-text-[--text-muted] pktw-leading-relaxed">
                    扫描 RAM、Ollama、已配 provider、笔记语言；
                    匹配 catalog 中的 model；生成推荐 + 理由。
                    通常 5-15 秒。
                </span>
            </div>
            {error && (
                <div className="pktw-text-xs pktw-text-red-500 pktw-bg-red-50 pktw-border pktw-border-red-200 pktw-rounded-md pktw-px-3 pktw-py-2 pktw-max-w-md">
                    {error}
                </div>
            )}
            <Button variant="ghost" size="sm" onClick={onCancel} className="pktw-gap-1 pktw-text-xs">
                <X size={12} /> 取消
            </Button>
        </div>
    );
}
