import type { ApprovalHandler, ApprovalResponse } from '@byfriends/sdk';

import { adaptApprovalRequest } from './adapter';
import type { ApprovalController } from './controller';

export function createApprovalRequestHandler(controller: ApprovalController): ApprovalHandler {
  return async (event): Promise<ApprovalResponse> => {
    try {
      const response = await controller.show(adaptApprovalRequest(event));
      return response;
    } catch {
      const response: ApprovalResponse = {
        decision: 'cancelled',
        feedback: 'approval handler failed',
      };
      return response;
    }
  };
}
