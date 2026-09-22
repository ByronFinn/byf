import type { PermissionPolicy } from '../policy';
import { AskUserQuestionAutoPermissionPolicy } from './ask-user-question';
import { createDefaultGitCwdWritePolicy } from './default-git-cwd-write';
import { BYFGovernanceFileWriteAskPolicy } from './governance-file-write-ask';
import { SensitiveFileReadAskPolicy } from './sensitive-file-read-ask';
import { YoloOutsideWorkspacePermissionPolicy } from './yolo-workspace-access';

export function createBuiltinPermissionPolicies(): readonly PermissionPolicy[] {
  return [
    YoloOutsideWorkspacePermissionPolicy,
    // 必须排在 `default.git-cwd-write` 之前：后者对工作区内任意非 .git 路径直接
    // allow，`<cwd>/.byf/mcp.json` 正落在它的范围内（#345）。
    BYFGovernanceFileWriteAskPolicy,
    createDefaultGitCwdWritePolicy(),
    AskUserQuestionAutoPermissionPolicy,
    SensitiveFileReadAskPolicy,
  ];
}

export { BYFGovernanceFileWriteAskPolicy } from './governance-file-write-ask';
export { AskUserQuestionAutoPermissionPolicy } from './ask-user-question';
export { createDefaultGitCwdWritePolicy } from './default-git-cwd-write';
export { SensitiveFileReadAskPolicy } from './sensitive-file-read-ask';
export { YoloOutsideWorkspacePermissionPolicy } from './yolo-workspace-access';
