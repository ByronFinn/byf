import type { PermissionPolicy } from '../policy';
import { AskUserQuestionAutoPermissionPolicy } from './ask-user-question';
import { createDefaultGitCwdWritePolicy } from './default-git-cwd-write';
import { createPlanPermissionPolicies } from './plan';
import { YoloOutsideWorkspacePermissionPolicy } from './yolo-workspace-access';

export function createBuiltinPermissionPolicies(): readonly PermissionPolicy[] {
  return [
    ...createPlanPermissionPolicies(),
    YoloOutsideWorkspacePermissionPolicy,
    createDefaultGitCwdWritePolicy(),
    AskUserQuestionAutoPermissionPolicy,
  ];
}

export { AskUserQuestionAutoPermissionPolicy } from './ask-user-question';
export { createDefaultGitCwdWritePolicy } from './default-git-cwd-write';
export { createPlanPermissionPolicies } from './plan';
export { YoloOutsideWorkspacePermissionPolicy } from './yolo-workspace-access';
