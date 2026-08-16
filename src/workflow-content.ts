import {
  buildGameLegalAuditPrompt,
  type GameLegalAuditPromptArguments,
  resolveLegalSourcePlanEvidence,
} from "./legal-prompt.js";
import {
  buildAuditProjectPrompt,
  buildPlayBuildPrompt,
  buildReviewChangePrompt,
  buildUiBlindComparePrompt,
  type AuditProjectPromptArguments,
  type PlayBuildPromptArguments,
  type ReviewChangePromptArguments,
  type UiBlindComparePromptArguments,
} from "./prompts.js";
import {trackReviewPromptEvidence} from "./review-prompt-evidence.js";
import type {ResultStore} from "./results.js";

export interface WorkflowContentDependencies {
  readSkill(id: string): Promise<string>;
  resultStore: ResultStore;
}

export function createWorkflowContent(
  dependencies: WorkflowContentDependencies,
) {
  return {
    async playBuild(input: PlayBuildPromptArguments): Promise<string> {
      return buildPlayBuildPrompt(await dependencies.readSkill("play-build.md"), input);
    },

    async reviewChange(input: ReviewChangePromptArguments): Promise<string> {
      return buildReviewChangePrompt(
        await dependencies.readSkill("game-review.md"),
        input,
        trackReviewPromptEvidence(dependencies.resultStore, {...input, mode: "change"}),
      );
    },

    async auditProject(input: AuditProjectPromptArguments): Promise<string> {
      return buildAuditProjectPrompt(
        await dependencies.readSkill("game-review.md"),
        input,
        trackReviewPromptEvidence(dependencies.resultStore, {...input, mode: "baseline"}),
      );
    },

    async uiBlindCompare(input: UiBlindComparePromptArguments): Promise<string> {
      return buildUiBlindComparePrompt(
        await dependencies.readSkill("ui-blind-compare.md"),
        input,
      );
    },

    async auditGameLegal(input: GameLegalAuditPromptArguments): Promise<string> {
      return buildGameLegalAuditPrompt(
        await dependencies.readSkill("game-legal-audit/SKILL.md"),
        input,
        resolveLegalSourcePlanEvidence(
          dependencies.resultStore,
          input.sourcePlanResultHandle,
        ),
      );
    },
  };
}

export type WorkflowContent = ReturnType<typeof createWorkflowContent>;
