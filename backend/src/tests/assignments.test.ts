import { beforeEach, describe, expect, it } from 'vitest';
import { pool } from '../db';
import {
  dbDescribe,
  insertSurveyFor,
  loginCookie,
  resetDb,
  userIdByUsername
} from './helpers';
import {
  chooseContiguousCluster,
  initialsForUsername,
  MAX_CLUSTER_GAP_METERS
} from '../services/assignment.service';

async function insertLocatedShop(shopId: string, lat: number, lon: number): Promise<void> {
  const geometry = {
    type: 'Polygon',
    coordinates: [[
      [lon, lat],
      [lon + 0.0000015, lat],
      [lon + 0.0000015, lat + 0.0000015],
      [lon, lat + 0.0000015],
      [lon, lat]
    ]]
  };
  await pool.query(
    `INSERT INTO shops
       (shop_id, geometry, geom_fingerprint, entity_handle, centroid_lat, centroid_lon,
        min_lon, min_lat, max_lon, max_lat, original_properties, source_file)
     VALUES ($1,$2,$3,$4,$5,$6,$6,$5,$7,$8,'{}','assignment-test')`,
    [shopId, JSON.stringify(geometry), `fp_${shopId}`, `handle_${shopId}`, lat, lon, lon + 0.0000015, lat + 0.0000015]
  );
}

async function seedCluster(size = 8): Promise<void> {
  for (let index = 0; index < size; index += 1) {
    await insertLocatedShop(`cluster_${index}`, 38.07, 46.29 + index * 0.00002);
  }
  await insertLocatedShop('distant_1', 38.07, 46.40);
}

dbDescribe('contiguous survey assignments', () => {
  beforeEach(async () => resetDb());

  it('generates short deterministic initials and avoids duplicate labels', () => {
    const used = new Set<string>();
    const first = initialsForUsername('محمدرضا جفی', 2, used);
    const second = initialsForUsername('محمدرضا جفی', 3, used);
    expect(first.length).toBeLessThanOrEqual(2);
    expect(second.length).toBeLessThanOrEqual(2);
    expect(second).not.toBe(first);
  });

  it('chooses a contiguous cluster and stops before a distant gap', () => {
    const shops = [
      { shop_id: 'a', centroid_lat: 38.07, centroid_lon: 46.29, geometry: {} },
      { shop_id: 'b', centroid_lat: 38.07, centroid_lon: 46.2901, geometry: {} },
      { shop_id: 'c', centroid_lat: 38.07, centroid_lon: 46.2902, geometry: {} },
      { shop_id: 'd', centroid_lat: 38.07, centroid_lon: 46.30, geometry: {} }
    ];
    const cluster = chooseContiguousCluster(shops, 10);
    expect(cluster.map((shop) => shop.shop_id)).toEqual(['a', 'b', 'c']);
    expect(MAX_CLUSTER_GAP_METERS).toBeGreaterThan(0);
  });

  it('excludes surveyed shops and returns the largest valid cluster when short', async () => {
    await seedCluster();
    await insertSurveyFor('cluster_0', 'پوشاک', 'jafari');
    const { app, cookie, userId } = await loginCookie('surveyor');

    const normal = await app.inject({
      method: 'POST',
      url: '/api/assignments/preview',
      headers: { cookie },
      payload: { requested_count: 4, member_ids: [userId] }
    });
    expect(normal.statusCode).toBe(200);
    expect(normal.json().actualCount).toBe(4);
    expect(normal.json().shops.features.map((feature: any) => feature.properties.shop_id)).not.toContain('cluster_0');
    expect(normal.json().shops.features.map((feature: any) => feature.properties.shop_id)).not.toContain('distant_1');

    const insufficient = await app.inject({
      method: 'POST',
      url: '/api/assignments/preview',
      headers: { cookie },
      payload: { requested_count: 50, member_ids: [userId] }
    });
    expect(insufficient.statusCode).toBe(200);
    expect(insufficient.json().sufficient).toBe(false);
    expect(insufficient.json().actualCount).toBe(7);
  });

  it('supersedes a Roll preview without creating an assignment', async () => {
    await seedCluster(5);
    const { app, cookie, userId } = await loginCookie('surveyor');
    const first = await app.inject({
      method: 'POST',
      url: '/api/assignments/preview',
      headers: { cookie },
      payload: { requested_count: 2, member_ids: [userId] }
    });
    const second = await app.inject({
      method: 'POST',
      url: '/api/assignments/preview',
      headers: { cookie },
      payload: { requested_count: 2, member_ids: [userId], replace_preview_id: first.json().previewId }
    });
    expect(second.statusCode).toBe(200);
    const assignments = await pool.query('SELECT COUNT(*)::int AS n FROM assignments');
    const previews = await pool.query('SELECT status FROM assignment_previews WHERE id = $1', [first.json().previewId]);
    expect(assignments.rows[0].n).toBe(0);
    expect(previews.rows[0].status).toBe('superseded');
  });

  it('allows only an admin to change colors and rejects unsafe colors', async () => {
    const admin = await loginCookie('admin');
    const surveyor = await loginCookie('surveyor');
    const userId = await userIdByUsername('jafari');
    const invalid = await admin.app.inject({
      method: 'PATCH', url: `/api/admin/users/${userId}`, headers: { cookie: admin.cookie },
      payload: { assignment_color: '#ff0000' }
    });
    expect(invalid.statusCode).toBe(400);
    const forbidden = await surveyor.app.inject({
      method: 'PATCH', url: `/api/admin/users/${userId}`, headers: { cookie: surveyor.cookie },
      payload: { assignment_color: '#7c3aed' }
    });
    expect(forbidden.statusCode).toBe(403);
    const changed = await admin.app.inject({
      method: 'PATCH', url: `/api/admin/users/${userId}`, headers: { cookie: admin.cookie },
      payload: { assignment_color: '#7c3aed' }
    });
    expect(changed.statusCode).toBe(200);
    expect(changed.json().user.assignment_color).toBe('#7c3aed');
  });

  it('confirms once, snapshots color, and rejects concurrent confirmation', async () => {
    await seedCluster(4);
    const admin = await loginCookie('admin');
    const userId = await userIdByUsername('jafari');
    await admin.app.inject({
      method: 'PATCH', url: `/api/admin/users/${userId}`, headers: { cookie: admin.cookie },
      payload: { assignment_color: '#db2777' }
    });
    const preview = await admin.app.inject({
      method: 'POST', url: '/api/assignments/preview', headers: { cookie: admin.cookie },
      payload: { requested_count: 3, member_ids: [userId] }
    });
    const previewId = preview.json().previewId;
    const results = await Promise.all([
      admin.app.inject({ method: 'POST', url: '/api/assignments/confirm', headers: { cookie: admin.cookie }, payload: { preview_id: previewId } }),
      admin.app.inject({ method: 'POST', url: '/api/assignments/confirm', headers: { cookie: admin.cookie }, payload: { preview_id: previewId } })
    ]);
    expect(results.map((result) => result.statusCode).sort()).toEqual([201, 409]);
    const assignment = await pool.query('SELECT id, primary_color, color_snapshot FROM assignments');
    expect(assignment.rowCount).toBe(1);
    expect(assignment.rows[0].primary_color).toBe('#db2777');
    expect(assignment.rows[0].color_snapshot[0].color).toBe('#db2777');
    const assignedShops = await pool.query('SELECT shop_id FROM assignment_shops WHERE assignment_id = $1', [assignment.rows[0].id]);
    const shopMap = await admin.app.inject({ method: 'GET', url: '/api/shops?limit=20', headers: { cookie: admin.cookie } });
    const visibleAssigned = shopMap.json().features.filter((feature: any) => assignedShops.rows.some((row) => row.shop_id === feature.properties.shop_id));
    expect(visibleAssigned.every((feature: any) => feature.properties.assignment_id === assignment.rows[0].id)).toBe(true);
    expect(visibleAssigned.every((feature: any) => feature.properties.assignment_color === '#db2777')).toBe(true);

    await admin.app.inject({
      method: 'PATCH', url: `/api/admin/users/${userId}`, headers: { cookie: admin.cookie },
      payload: { assignment_color: '#2563eb' }
    });
    const history = await admin.app.inject({ method: 'GET', url: '/api/admin/assignments', headers: { cookie: admin.cookie } });
    expect(history.json().assignments[0].members[0].color).toBe('#db2777');

    const nextPreview = await admin.app.inject({
      method: 'POST', url: '/api/assignments/preview', headers: { cookie: admin.cookie },
      payload: { requested_count: 10, member_ids: [userId] }
    });
    const assignedIds = new Set(assignedShops.rows.map((row) => row.shop_id));
    expect(nextPreview.json().shops.features.some((feature: any) => assignedIds.has(feature.properties.shop_id))).toBe(false);
  });

  it('paints one compact team area with each selected member color', async () => {
    await seedCluster(6);
    const admin = await loginCookie('admin');
    const jafariId = await userIdByUsername('jafari');
    const moradiId = await userIdByUsername('moradi');
    const preview = await admin.app.inject({
      method: 'POST', url: '/api/assignments/preview', headers: { cookie: admin.cookie },
      payload: { requested_count: 6, member_ids: [jafariId, moradiId] }
    });
    expect(new Set(preview.json().shops.features.map((feature: any) => feature.properties.assignment_color)).size).toBe(2);
    const confirmed = await admin.app.inject({
      method: 'POST', url: '/api/assignments/confirm', headers: { cookie: admin.cookie },
      payload: { preview_id: preview.json().previewId }
    });
    expect(confirmed.statusCode).toBe(201);
    const assignmentId = confirmed.json().assignmentId;
    const members = await pool.query('SELECT member_id, COUNT(*)::int AS n FROM assignment_shops WHERE assignment_id = $1 GROUP BY member_id ORDER BY member_id', [assignmentId]);
    expect(members.rows).toHaveLength(2);
    expect(members.rows.every((row) => row.member_id !== null && row.n > 0)).toBe(true);
    const shops = await admin.app.inject({ method: 'GET', url: '/api/shops?limit=20', headers: { cookie: admin.cookie } });
    const colors = new Set(shops.json().features
      .filter((feature: any) => feature.properties.assignment_id === assignmentId)
      .map((feature: any) => feature.properties.assignment_color));
    expect(colors.size).toBe(2);
  });

  it('completes from ordinary GPS-optional survey saves and preserves history after archive', async () => {
    await seedCluster(2);
    const admin = await loginCookie('admin');
    const userId = await userIdByUsername('jafari');
    const preview = await admin.app.inject({
      method: 'POST', url: '/api/assignments/preview', headers: { cookie: admin.cookie },
      payload: { requested_count: 2, member_ids: [userId] }
    });
    const confirmed = await admin.app.inject({
      method: 'POST', url: '/api/assignments/confirm', headers: { cookie: admin.cookie },
      payload: { preview_id: preview.json().previewId }
    });
    expect(confirmed.statusCode).toBe(201);
    const assignmentId = confirmed.json().assignmentId;
    const assigned = await pool.query('SELECT shop_id FROM assignment_shops WHERE assignment_id = $1 ORDER BY shop_id', [assignmentId]);
    const surveyor = await loginCookie('surveyor');
    for (const row of assigned.rows) {
      const saved = await surveyor.app.inject({
        method: 'POST', url: '/api/surveys', headers: { cookie: surveyor.cookie },
        payload: { shop_id: row.shop_id, activity: 'پوشاک', building_condition: 'سالم' }
      });
      expect(saved.statusCode).toBe(201);
    }
    const active = await pool.query('SELECT status FROM assignments WHERE id = $1', [assignmentId]);
    expect(active.rows[0].status).toBe('completed');

    const archived = await admin.app.inject({
      method: 'POST', url: `/api/admin/assignments/${assignmentId}/status`, headers: { cookie: admin.cookie },
      payload: { status: 'archived' }
    });
    expect(archived.statusCode).toBe(200);
    const history = await admin.app.inject({ method: 'GET', url: '/api/admin/assignments', headers: { cookie: admin.cookie } });
    expect(history.json().assignments[0].id).toBe(assignmentId);
    expect(history.json().assignments[0].status).toBe('archived');
  });

  it('hides an archived active assignment from active map while retaining history', async () => {
    await seedCluster(2);
    const admin = await loginCookie('admin');
    const userId = await userIdByUsername('jafari');
    const preview = await admin.app.inject({
      method: 'POST', url: '/api/assignments/preview', headers: { cookie: admin.cookie },
      payload: { requested_count: 1, member_ids: [userId] }
    });
    const confirmed = await admin.app.inject({
      method: 'POST', url: '/api/assignments/confirm', headers: { cookie: admin.cookie },
      payload: { preview_id: preview.json().previewId }
    });
    const id = confirmed.json().assignmentId;
    const archived = await admin.app.inject({
      method: 'POST', url: `/api/admin/assignments/${id}/status`, headers: { cookie: admin.cookie },
      payload: { status: 'archived' }
    });
    expect(archived.statusCode).toBe(200);
    const active = await admin.app.inject({ method: 'GET', url: '/api/assignments/active', headers: { cookie: admin.cookie } });
    expect(active.json().assignments).toHaveLength(0);
    const history = await admin.app.inject({ method: 'GET', url: '/api/admin/assignments', headers: { cookie: admin.cookie } });
    expect(history.json().assignments[0].status).toBe('archived');
  });
});
