import { describe, expect, it } from 'vitest';
import { assignmentLegendMembers } from './assignments';

describe('assignment legend data', () => {
  it('deduplicates by surveyor id and lets the current preview win', () => {
    const active = [{
      members: [
        { user_id: 2, username: 'جفی', color: '#2563eb', initials: 'JF' },
        { user_id: 3, username: 'علی', color: '#7c3aed', initials: 'AL' }
      ]
    }] as any;
    const result = assignmentLegendMembers(active, [
      { user_id: 2, username: 'جفی', color: '#0891b2', initials: 'جف' }
    ]);
    expect(result).toHaveLength(2);
    expect(result.find((item) => item.user_id === 2)?.color).toBe('#0891b2');
  });
});
