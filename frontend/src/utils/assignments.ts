import type { Assignment, AssignmentMember } from '../types';

/** Returns only active/relevant members, with stable user-id deduplication. */
export function assignmentLegendMembers(
  assignments: Assignment[],
  previewMembers: AssignmentMember[] = []
): AssignmentMember[] {
  const byId = new Map<number, AssignmentMember>();
  for (const assignment of assignments) {
    for (const member of assignment.members) byId.set(member.user_id, member);
  }
  for (const member of previewMembers) byId.set(member.user_id, member);
  return [...byId.values()];
}
