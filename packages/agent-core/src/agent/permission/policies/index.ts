import type { PermissionPolicy } from '../policy';
import { AskUserQuestionAutoPermissionPolicy } from './ask-user-question';
import { createDefaultGitCwdWritePolicy } from './default-git-cwd-write';
import { SensitiveFileReadAskPolicy } from './sensitive-file-read-ask';
import { YoloOutsideWorkspacePermissionPolicy } from './yolo-workspace-access';

export function createBuiltinPermissionPolicies(): readonly PermissionPolicy[] {
  return [
    YoloOutsideWorkspacePermissionPolicy,
    createDefaultGitCwdWritePolicy(),
    AskUserQuestionAutoPermissionPolicy,
    SensitiveFileReadAskPolicy,
  ];
}

export { AskUserQuestionAutoPermissionPolicy } from './ask-user-question';
export { createDefaultGitCwdWritePolicy } from './default-git-cwd-write';
export { SensitiveFileReadAskPolicy } from './sensitive-file-read-ask';
export { YoloOutsideWorkspacePermissionPolicy } from './yolo-workspace-access';
