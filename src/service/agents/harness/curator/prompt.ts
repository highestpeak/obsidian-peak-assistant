/**
 * Curator prompt builder. Soft suggestions only — hard constraints are
 * enforced by validation.ts after the LLM responds.
 *
 * See spec §6.1.
 */

import { PromptId } from '@/core/types/prompt';
import { TemplateManager } from '@/core/template/TemplateManager';
import { serializeForPrompt } from './catalog';
import { summarizeEnvironment, summarizePreferences } from './envProbe';
import { formatErrorsForLLM } from './validation';
import type { CuratorContext, ValidationError } from './types';

/**
 * T11Y-6: Curator system prompt body moved to templates/prompts/curator-system.md
 * (PromptId.CuratorSystem). Callers should `await getCuratorSystemPrompt()` instead
 * of importing the previous string constant.
 */
export async function getCuratorSystemPrompt(): Promise<string> {
    const tm = TemplateManager.getInstance();
    if (!tm) throw new Error('TemplateManager not bound — cannot render curator system prompt.');
    return tm.render(PromptId.CuratorSystem, {});
}

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
