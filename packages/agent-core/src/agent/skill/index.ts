import { randomUUID } from 'node:crypto';

import type { ContentPart } from '@byfriends/kosong';

import { ErrorCodes, ByfError } from '#/errors';
import type { ActivateSkillPayload } from '#/rpc';

import type { Agent } from '..';
import { isUserActivatableSkillType, type SkillRegistry } from '../../skill';
import type { SkillActivationOrigin } from '../context';

export class SkillManager {
  constructor(
    protected readonly agent: Agent,
    public readonly registry: SkillRegistry,
  ) {}

  activate(input: ActivateSkillPayload): void {
    const skill = this.registry.getSkill(input.name);
    if (skill === undefined) {
      throw new ByfError(ErrorCodes.SKILL_NOT_FOUND, `Skill "${input.name}" was not found`);
    }
    if (!isUserActivatableSkillType(skill.metadata.type)) {
      throw new ByfError(
        ErrorCodes.SKILL_TYPE_UNSUPPORTED,
        `Skill "${skill.name}" cannot be activated by the user`,
      );
    }

    const origin: SkillActivationOrigin = {
      kind: 'skill_activation',
      activationId: randomUUID(),
      skillName: skill.name,
      trigger: 'user-slash',
      skillType: skill.metadata.type,
      skillPath: skill.path,
      skillSource: skill.source,
      skillArgs: input.args,
    };
    const skillContent = this.registry.renderSkillPrompt(skill, input.args ?? '');

    this.recordActivation(origin, [
      {
        type: 'text',
        text: skillContent,
      },
    ]);

    // Append a <byf-skill-loaded> reminder so the model knows the skill
    // is already loaded and does not redundantly invoke the Skill tool.
    this.agent.context.appendSystemReminder(
      `<byf-skill-loaded name="${skill.name}">\n${skillContent}\n</byf-skill-loaded>`,
      origin,
    );
  }

  recordActivation(
    origin: SkillActivationOrigin,
    input?: readonly ContentPart[] | undefined,
  ): void {
    this.agent.emitEvent({
      type: 'skill.activated',
      activationId: origin.activationId,
      skillName: origin.skillName,
      trigger: origin.trigger,
      skillArgs: origin.skillArgs,
      skillPath: origin.skillPath,
      skillSource: origin.skillSource,
    });
    this.agent.telemetry.track('skill_invoked', {
      skill_name: origin.skillName,
      trigger: origin.trigger,
    });
    if (origin.skillType === 'flow') {
      this.agent.telemetry.track('flow_invoked', {
        flow_name: origin.skillName,
      });
    }
    if (input !== undefined) {
      this.agent.turn.prompt(input, origin);
    }
  }
}
