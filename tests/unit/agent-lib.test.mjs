import { describe, expect, it } from 'vitest';
import { incrementCycleId, nextPhase } from '../../scripts/agent-lib.mjs';

describe('agent-lib', () => {
  it('increments zero-padded cycle IDs', () => {
    expect(incrementCycleId('cycle-0001')).toBe('cycle-0002');
    expect(incrementCycleId('cycle-0099')).toBe('cycle-0100');
  });

  it('advances known phases', () => {
    expect(nextPhase('SELECT_RESEARCH_TASK')).toBe('PLAN_APP_CHANGE');
    expect(nextPhase('MERGE_PR')).toBe('WAITING_FOR_MANUAL_MERGE');
    expect(nextPhase('WAITING_FOR_MANUAL_MERGE')).toBe('CLEANUP_BRANCH');
  });
});
