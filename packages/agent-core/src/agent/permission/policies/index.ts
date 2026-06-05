import type { PermissionPolicy } from '../policy';
import { AskUserQuestionAutoPermissionPolicy } from './ask-user-question';
import { createDefaultGitCwdWritePolicy } from './default-git-cwd-write';
import { YoloOutsideWorkspacePermissionPolicy } from './yolo-workspace-access';

export function createBuiltinPermissionPolicies(): readonly PermissionPolicy[] {
  return [
    YoloOutsideWorkspacePermissionPolicy,
    createDefaultGitCwdWritePolicy(),
    AskUserQuestionAutoPermissionPolicy,
  ];
}

export { AskUserQuestionAutoPermissionPolicy } from './ask-user-question';
export { createDefaultGitCwdWritePolicy } from './default-git-cwd-write';
export { YoloOutsideWorkspacePermissionPolicy } from './yolo-workspace-access';
