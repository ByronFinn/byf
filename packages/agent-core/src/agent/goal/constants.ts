/** objective 字符数上限（PRD-0019 R15）。 */
export const MAX_GOAL_OBJECTIVE_LENGTH = 4000;

/** goal continuation turn 的 origin（PRD-0019；#201 driver 使用）。 */
export const GOAL_CONTINUATION_ORIGIN = {
  kind: 'system_trigger',
  name: 'goal_continuation',
} as const;

/** goal continuation turn 的 user input 文案（PRD-0019；#201 driver 使用）。 */
export const GOAL_CONTINUATION_PROMPT = 'Continue pursuing the active goal.';
