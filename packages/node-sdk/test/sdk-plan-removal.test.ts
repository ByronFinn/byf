import { describe, expectTypeOf, it } from 'vitest';
import type { Session } from '#/index';

describe('SDK plan exports removed (PRD-0009)', () => {
  it('getPlan is not on the Session type', () => {
    type HasGetPlan = 'getPlan' extends keyof Session ? true : false;
    expectTypeOf<HasGetPlan>().toEqualTypeOf<false>();
  });

  it('clearPlan is not on the Session type', () => {
    type HasClearPlan = 'clearPlan' extends keyof Session ? true : false;
    expectTypeOf<HasClearPlan>().toEqualTypeOf<false>();
  });
});