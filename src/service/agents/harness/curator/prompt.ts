/**
 * Curator prompt builder. Soft suggestions only — hard constraints are
 * enforced by validation.ts after the LLM responds.
 *
 * See spec §6.1.
 */

import { serializeForPrompt } from './catalog';
import { summarizeEnvironment, summarizePreferences } from './envProbe';
import { formatErrorsForLLM } from './validation';
import type { CuratorContext, ValidationError } from './types';

export const CURATOR_SYSTEM_PROMPT = `你是 Peak Assistant 的配置顾问。
基于用户的环境信息和偏好，为 Quick / Deep / Premium 三个 capability 各推荐一个 model，并决定是否启用 cascade。
输出必须严格符合给定的 JSON schema（zod 校验），不要 markdown、不要解释外的多余文字。
rationale 字段用中文，2-3 句说明为什么这样配，要点出关键取舍。`;

export interface PromptInputs {
    ctx: CuratorContext;
    /** Validation errors from the previous attempt, if any. */
    priorErrors?: ValidationError[];
    /** Free-form note from the user when re-running ("再来一次"). */
    userFollowup?: string;
}

export function buildCuratorPrompt({ ctx, priorErrors, userFollowup }: PromptInputs): string {
    const sections: string[] = [];

    sections.push('## 用户环境（已探测）');
    sections.push(summarizeEnvironment(ctx.env));

    sections.push('\n## 用户偏好');
    sections.push(summarizePreferences(ctx.preferences));

    if (ctx.userNote) {
        sections.push('\n## 用户备注');
        sections.push(ctx.userNote);
    }

    if (userFollowup) {
        sections.push('\n## 用户重来的反馈');
        sections.push(userFollowup);
    }

    sections.push('\n## 可选 model（catalog；只能从中选 id）');
    sections.push('```json');
    sections.push(serializeForPrompt());
    sections.push('```');

    sections.push('\n## 软建议（不是硬规则，可违反但要在 rationale 里解释）');
    sections.push(
        [
            '- 中文为主的 vault：Qwen / GLM / DeepSeek 在 C-Eval 上常优于同 size 的 Claude/GPT',
            '- Quick tier：~1s 单步响应优先，<= 14B 本地 model 或 Haiku/Flash 级别',
            '- Deep tier：多步推理任务，BFCL > 0.85 为佳',
            '- Premium tier：作为 cascade 兜底；如用户 budget=zero 可与 Deep 同',
            '- 不要让用户下载超过现 RAM 一半的 model',
            '- 优先用已配 / 已装的模型，减少用户额外操作',
            '- modelsToDownload 只列还没在 ollamaInstalledModels 里且 kind=ollama 的',
            '- apiKeysNeeded 只列 hasCredentials=false 但被你选中的 provider',
        ].join('\n'),
    );

    if (priorErrors && priorErrors.length > 0) {
        sections.push('\n## 上次输出的校验错误（请修正后重新输出）');
        sections.push(formatErrorsForLLM(priorErrors));
    }

    sections.push('\n## 输出');
    sections.push('返回一个 JSON 对象，匹配 schema：bindings / cascadeEnabled / modelsToDownload / apiKeysNeeded / rationale。');

    return sections.join('\n');
}
