import { randomInt, randomUUID } from 'crypto';
import { pool, withTransaction } from '../db';
import { AppError } from '../utils/errors';

export const ASSIGNMENT_COLORS = [
  '#2563eb', '#7c3aed', '#0891b2', '#d97706',
  '#db2777', '#4f46e5', '#0f766e', '#64748b'
] as const;

export type AssignmentColor = (typeof ASSIGNMENT_COLORS)[number];

export function assignmentColorForUserId(userId: number): AssignmentColor {
  return ASSIGNMENT_COLORS[Math.abs(userId - 1) % ASSIGNMENT_COLORS.length];
}

interface CandidateShop {
  shop_id: string;
  centroid_lat: number;
  centroid_lon: number;
  geometry: unknown;
}

/** Maximum step between neighbouring shops in one contiguous work area. */
export const MAX_CLUSTER_GAP_METERS = 120;

export interface AssignmentMember {
  user_id: number;
  username: string;
  color: AssignmentColor;
  initials: string;
}

export interface AssignmentRow {
  id: string;
  requested_count: number;
  actual_count: number;
  status: string;
  created_at: string;
  completed_at: string | null;
  archived_at: string | null;
  primary_color: AssignmentColor;
  color_snapshot: AssignmentSnapshot[];
  surveyed_count: number;
  members: AssignmentMember[];
  shop_ids: string[];
}

interface AssignmentSnapshot {
  user_id: number;
  username: string;
  color: AssignmentColor;
  initials: string;
}

export function validateAssignmentColor(value: unknown): AssignmentColor {
  if (typeof value !== 'string' || !ASSIGNMENT_COLORS.includes(value as AssignmentColor)) {
    throw new AppError(400, 'invalid_assignment_color', 'رنگ انتخاب‌شده برای assignment معتبر نیست.');
  }
  return value as AssignmentColor;
}

export function initialsForUsername(username: string, userId: number, used = new Set<string>()): string {
  const words = username.trim().split(/\s+/).filter(Boolean);
  const letters = words.join('').replace(/[^\p{L}\p{N}]/gu, '');
  const first = letters.slice(0, 2).toUpperCase() || String(userId % 100).padStart(2, '0');
  if (!used.has(first)) {
    used.add(first);
    return first;
  }
  const alternatives = [
    `${letters.slice(0, 1)}${letters.slice(-1)}`.toUpperCase(),
    `${letters.slice(0, 1)}${userId % 10}`.toUpperCase(),
    String(userId % 100).padStart(2, '0')
  ];
  for (const candidate of alternatives) {
    if (candidate.length <= 2 && !used.has(candidate)) {
      used.add(candidate);
      return candidate;
    }
  }
  // User IDs make this fallback deterministic. Base-36 gives a large pool
  // while keeping the label at the required one/two-character size.
  for (let value = 0; value < 36 * 36; value += 1) {
    const candidate = value.toString(36).toUpperCase().padStart(2, '0');
    if (!used.has(candidate)) {
      used.add(candidate);
      return candidate;
    }
  }
  used.add(first);
  return first;
}

function distance(a: CandidateShop, b: CandidateShop): number {
  const latScale = 111_000;
  const lonScale = 111_000 * Math.cos((a.centroid_lat * Math.PI) / 180);
  const dx = (a.centroid_lon - b.centroid_lon) * lonScale;
  const dy = (a.centroid_lat - b.centroid_lat) * latScale;
  return Math.sqrt(dx * dx + dy * dy);
}

function clusterScore(cluster: CandidateShop[]): number {
  if (cluster.length < 2) return 0;
  const center = cluster.reduce(
    (sum, item) => ({ lat: sum.lat + item.centroid_lat, lon: sum.lon + item.centroid_lon }),
    { lat: 0, lon: 0 }
  );
  center.lat /= cluster.length;
  center.lon /= cluster.length;
  const centerShop = { ...cluster[0], centroid_lat: center.lat, centroid_lon: center.lon };
  const distances = cluster.map((item) => distance(item, centerShop));
  return distances.reduce((sum, item) => sum + item, 0) / cluster.length + Math.max(...distances) * 0.35;
}

function growCluster(shops: CandidateShop[], seedIndex: number, requestedCount: number): CandidateShop[] {
  const chosen = [shops[seedIndex]];
  const selected = new Set([shops[seedIndex].shop_id]);
  while (chosen.length < requestedCount && chosen.length < shops.length) {
    let best: CandidateShop | null = null;
    let bestDistance = Number.POSITIVE_INFINITY;
    for (const candidate of shops) {
      if (selected.has(candidate.shop_id)) continue;
      let nearest = Number.POSITIVE_INFINITY;
      for (const current of chosen) nearest = Math.min(nearest, distance(candidate, current));
      if (nearest < bestDistance || (nearest === bestDistance && candidate.shop_id < (best?.shop_id || '\uffff'))) {
        best = candidate;
        bestDistance = nearest;
      }
    }
    if (!best || bestDistance > MAX_CLUSTER_GAP_METERS) break;
    selected.add(best.shop_id);
    chosen.push(best);
  }
  return chosen;
}

export function chooseContiguousCluster(
  shops: CandidateShop[],
  requestedCount: number,
  randomSeed = 0
): CandidateShop[] {
  if (shops.length === 0 || requestedCount <= 0) return [];
  const target = Math.min(requestedCount, shops.length);
  const seedCount = Math.min(12, shops.length);
  const sorted = [...shops].sort((a, b) => a.shop_id.localeCompare(b.shop_id));
  const offset = Math.abs(randomSeed) % sorted.length;
  const seeds = Array.from({ length: seedCount }, (_, index) =>
    (Math.min(sorted.length - 1, Math.floor((index * sorted.length) / seedCount)) + offset) % sorted.length
  );
  let best = growCluster(sorted, seeds[0], target);
  let bestScore = clusterScore(best);
  for (const seed of seeds.slice(1)) {
    const candidate = growCluster(sorted, seed, target);
    const score = clusterScore(candidate);
    if (candidate.length > best.length || (candidate.length === best.length && score < bestScore)) {
      best = candidate;
      bestScore = score;
    }
  }
  return best;
}

async function eligibleShops(): Promise<CandidateShop[]> {
  const result = await pool.query<CandidateShop>(
    `SELECT s.shop_id, s.centroid_lat, s.centroid_lon, s.geometry
     FROM shops s
     WHERE NOT EXISTS (SELECT 1 FROM surveys sv WHERE sv.shop_id = s.shop_id)
       AND NOT EXISTS (
         SELECT 1 FROM assignment_shops ash
         JOIN assignments aa ON aa.id = ash.assignment_id
         WHERE ash.shop_id = s.shop_id AND aa.status = 'active'
       )
     ORDER BY s.shop_id`
  );
  return result.rows;
}

async function membersForIds(ids: number[]): Promise<AssignmentMember[]> {
  const result = await pool.query<{ id: number; username: string; assignment_color: string }>(
    `SELECT id, username, assignment_color FROM users
     WHERE id = ANY($1::int[]) AND role = 'surveyor' AND is_active = TRUE ORDER BY id`,
    [ids]
  );
  if (result.rows.length !== ids.length) {
    throw new AppError(400, 'invalid_assignment_members', 'همه اعضای انتخاب‌شده ممیز فعال نیستند.');
  }
  const used = new Set<string>();
  return result.rows.map((row) => ({
    user_id: row.id,
    username: row.username,
    color: validateAssignmentColor(row.assignment_color),
    initials: initialsForUsername(row.username, row.id, used)
  }));
}

function snapshot(members: AssignmentMember[]): AssignmentSnapshot[] {
  return members.map((member) => ({
    user_id: member.user_id,
    username: member.username,
    color: member.color,
    initials: member.initials
  }));
}

function memberForShopIndex(members: AssignmentMember[], index: number, total: number): AssignmentMember {
  const memberIndex = Math.min(members.length - 1, Math.floor((index * members.length) / Math.max(total, 1)));
  return members[memberIndex];
}

export async function listSurveyors() {
  const result = await pool.query<{ id: number; username: string; assignment_color: string }>(
    `SELECT id, username, assignment_color FROM users
     WHERE role = 'surveyor' AND is_active = TRUE ORDER BY id`
  );
  const used = new Set<string>();
  return result.rows.map((row) => ({
    id: row.id,
    username: row.username,
    color: validateAssignmentColor(row.assignment_color),
    initials: initialsForUsername(row.username, row.id, used)
  }));
}

export async function createPreview(
  createdBy: number,
  requestedCount: number,
  memberIds: number[],
  replacePreviewId?: string
) {
  if (!Number.isInteger(requestedCount) || requestedCount <= 0) {
    throw new AppError(400, 'invalid_assignment_count', 'تعداد assignment باید عددی مثبت باشد.');
  }
  const uniqueMemberIds = [...new Set(memberIds.map(Number))].filter(Number.isInteger);
  if (uniqueMemberIds.length === 0) {
    throw new AppError(400, 'missing_assignment_members', 'حداقل یک ممیز را انتخاب کنید.');
  }
  const members = await membersForIds(uniqueMemberIds);
  const selected = chooseContiguousCluster(await eligibleShops(), requestedCount, randomInt(0, 1_000_000));
  const id = randomUUID();
  await withTransaction(async (client) => {
    if (replacePreviewId) {
      await client.query(
        `UPDATE assignment_previews SET status = 'superseded'
         WHERE id = $1 AND created_by = $2 AND status = 'pending'`,
        [replacePreviewId, createdBy]
      );
    }
    await client.query(
      `INSERT INTO assignment_previews
       (id, created_by, requested_count, member_ids, shop_ids, color_snapshot)
       VALUES ($1, $2, $3, $4::int[], $5::text[], $6::jsonb)`,
      [id, createdBy, requestedCount, uniqueMemberIds, selected.map((shop) => shop.shop_id), JSON.stringify(snapshot(members))]
    );
  });
  return {
    previewId: id,
    requestedCount,
    actualCount: selected.length,
    sufficient: selected.length >= requestedCount,
    reason: selected.length >= requestedCount ? null : 'not_enough_contiguous_shops',
    members,
    shops: { type: 'FeatureCollection', features: selected.map((shop, index) => {
      const member = memberForShopIndex(members, index, selected.length);
      return {
      type: 'Feature',
      properties: {
        shop_id: shop.shop_id,
        surveyed: false,
        assignment_color: member.color,
        assignment_member_id: member.user_id
      },
      geometry: shop.geometry
      };
    }) }
  };
}

export async function confirmPreview(previewId: string, actorId: number, actorRole: 'admin' | 'surveyor') {
  try {
    return await withTransaction(async (client) => {
    // One transaction-wide lock serializes confirmation and prevents two
    // previews from reserving the same shop at the same time.
    await client.query(`SELECT pg_advisory_xact_lock(hashtext('bazar-active-assignment'))`);
    const previewResult = await client.query(
      `SELECT * FROM assignment_previews
       WHERE id = $1 AND status = 'pending' AND expires_at > now()
       FOR UPDATE`,
      [previewId]
    );
    if (!previewResult.rowCount) throw new AppError(409, 'preview_not_confirmable', 'این پیش‌نمایش منقضی یا قبلاً استفاده شده است.');
    const preview = previewResult.rows[0];
    if (actorRole !== 'admin' && preview.created_by !== actorId) {
      throw new AppError(403, 'assignment_forbidden', 'فقط ایجادکننده می‌تواند assignment را تأیید کند.');
    }
    const shopIds = preview.shop_ids as string[];
    if (shopIds.length === 0) {
      throw new AppError(409, 'not_enough_contiguous_shops', 'هیچ مغازه پیوسته و قابل اختصاصی باقی نمانده است.');
    }
    const conflict = await client.query(
      `SELECT s.shop_id FROM shops s
       LEFT JOIN surveys sv ON sv.shop_id = s.shop_id
       WHERE s.shop_id = ANY($1::text[])
         AND (sv.shop_id IS NOT NULL OR EXISTS (
           SELECT 1 FROM assignment_shops ash JOIN assignments aa ON aa.id = ash.assignment_id
           WHERE ash.shop_id = s.shop_id AND aa.status = 'active'
         ))
       FOR UPDATE OF s`,
      [shopIds]
    );
    if (conflict.rowCount) throw new AppError(409, 'assignment_conflict', 'بخشی از این مغازه‌ها دیگر قابل اختصاص نیستند. دوباره Roll کنید.');
    const assignmentId = randomUUID();
    const colorSnapshot = preview.color_snapshot as AssignmentSnapshot[];
    const primaryColor = colorSnapshot[0]?.color || ASSIGNMENT_COLORS[0];
    await client.query(
      `INSERT INTO assignments
       (id, requested_count, actual_count, created_by, primary_color, color_snapshot)
       VALUES ($1, $2, $3, $4, $5, $6::jsonb)`,
      [assignmentId, preview.requested_count, shopIds.length, preview.created_by, primaryColor, JSON.stringify(colorSnapshot)]
    );
    for (const member of colorSnapshot) {
      await client.query(
        `INSERT INTO assignment_members
         (assignment_id, user_id, username_snapshot, color_snapshot, initials_snapshot)
         VALUES ($1, $2, $3, $4, $5)`,
        [assignmentId, member.user_id, member.username, member.color, member.initials]
      );
    }
    if (shopIds.length > 0) {
      for (let memberIndex = 0; memberIndex < colorSnapshot.length; memberIndex += 1) {
        const member = colorSnapshot[memberIndex];
        const start = Math.floor((memberIndex * shopIds.length) / colorSnapshot.length);
        const end = Math.floor(((memberIndex + 1) * shopIds.length) / colorSnapshot.length);
        const memberShopIds = shopIds.slice(start, end);
        if (memberShopIds.length === 0) continue;
        await client.query(
          `INSERT INTO assignment_shops (assignment_id, shop_id, member_id)
           SELECT $1, unnest($2::text[]), $3`,
          [assignmentId, memberShopIds, member.user_id]
        );
      }
    }
    await client.query(`UPDATE assignment_previews SET status = 'confirmed' WHERE id = $1`, [previewId]);
    return { assignmentId, actualCount: shopIds.length, status: 'active' };
    });
  } catch (err) {
    if ((err as { code?: string }).code === '23P01') {
      throw new AppError(409, 'assignment_conflict', 'بخشی از این مغازه‌ها دیگر قابل اختصاص نیستند. دوباره Roll کنید.');
    }
    throw err;
  }
}

export async function listActiveAssignments(userId: number, role: 'admin' | 'surveyor') {
  const result = await pool.query(
    `SELECT a.id, a.requested_count, a.actual_count, a.status, a.created_at,
            a.completed_at, a.archived_at, a.primary_color, a.color_snapshot,
            COALESCE((SELECT COUNT(*) FROM assignment_shops ash
                      JOIN surveys sv ON sv.shop_id = ash.shop_id
                      WHERE ash.assignment_id = a.id), 0)::int AS surveyed_count
     FROM assignments a
     WHERE a.status = 'active'
       AND ($1 = 'admin' OR EXISTS (
         SELECT 1 FROM assignment_members am WHERE am.assignment_id = a.id AND am.user_id = $2
       ))
     ORDER BY a.created_at DESC`,
    [role, userId]
  );
  return enrichAssignments(result.rows);
}

async function enrichAssignments(rows: any[]) {
  const output = [];
  for (const row of rows) {
    const members = await pool.query(
      `SELECT user_id, username_snapshot AS username, color_snapshot AS color, initials_snapshot AS initials
       FROM assignment_members WHERE assignment_id = $1 ORDER BY user_id`,
      [row.id]
    );
    const shops = await pool.query(
      `SELECT shop_id FROM assignment_shops WHERE assignment_id = $1 ORDER BY shop_id`,
      [row.id]
    );
    output.push({ ...row, members: members.rows, shop_ids: shops.rows.map((item) => item.shop_id) });
  }
  return output;
}

export async function listAssignmentHistory() {
  const result = await pool.query(
    `SELECT a.id, a.requested_count, a.actual_count, a.status, a.created_at,
            a.completed_at, a.archived_at, a.primary_color, a.color_snapshot,
            COALESCE((SELECT COUNT(*) FROM assignment_shops ash
                      JOIN surveys sv ON sv.shop_id = ash.shop_id
                      WHERE ash.assignment_id = a.id), 0)::int AS surveyed_count
     FROM assignments a ORDER BY a.created_at DESC`
  );
  return enrichAssignments(result.rows);
}

export async function changeAssignmentStatus(id: string, status: 'archived' | 'cancelled') {
  const result = await pool.query(
    `UPDATE assignments
     SET status = $2, archived_at = CASE WHEN $2 = 'archived' THEN now() ELSE archived_at END
     WHERE id = $1
       AND (($2 = 'archived' AND status IN ('active', 'completed'))
         OR ($2 = 'cancelled' AND status = 'active'))
     RETURNING id, status, archived_at`,
    [id, status]
  );
  if (!result.rowCount) throw new AppError(409, 'assignment_not_active', 'این assignment فعال نیست.');
  return result.rows[0];
}

export async function completeAssignmentsForShop(shopId: string) {
  await pool.query(
    `UPDATE assignments a SET status = 'completed', completed_at = now()
     WHERE a.status = 'active'
       AND EXISTS (SELECT 1 FROM assignment_shops ash WHERE ash.assignment_id = a.id AND ash.shop_id = $1)
       AND NOT EXISTS (
         SELECT 1 FROM assignment_shops ash
         WHERE ash.assignment_id = a.id
           AND NOT EXISTS (SELECT 1 FROM surveys sv WHERE sv.shop_id = ash.shop_id)
       )`,
    [shopId]
  );
}
