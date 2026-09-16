import { pool } from '../db';
import { logger } from '../logger';
import { AppError } from '../utils/errors';
import { maybeAutoSync } from './github.service';
import { completeAssignmentsForShop } from './assignment.service';

export interface SurveyInput {
  shop_id: string;
  shop_name: string | null;
  activity: string | null;
  activity_other: string | null;
  building_condition: string | null;
  survey_lat: number | null;
  survey_lon: number | null;
}

/**
 * Creates or updates the current survey for a shop.
 * A shop always has at most one survey (upsert on shop_id). Survey metadata
 * (surveyor, timestamp, GPS) is always captured server-side, never from the
 * client form.
 */
export async function saveSurvey(surveyorId: number, input: SurveyInput) {
  const shop = await pool.query('SELECT shop_id FROM shops WHERE shop_id = $1', [input.shop_id]);
  if (!shop.rowCount) {
    throw new AppError(404, 'shop_not_found', 'مغازه مورد نظر یافت نشد.');
  }

  const existing = await pool.query('SELECT id FROM surveys WHERE shop_id = $1', [input.shop_id]);
  const isUpdate = (existing.rowCount ?? 0) > 0;

  const result = await pool.query(
    `INSERT INTO surveys
       (shop_id, shop_name, activity, activity_other, building_condition,
        surveyor_id, surveyed_at, survey_lat, survey_lon)
     VALUES ($1,$2,$3,$4,$5,$6, now(), $7,$8)
     ON CONFLICT (shop_id) DO UPDATE SET
       shop_name = EXCLUDED.shop_name,
       activity = EXCLUDED.activity,
       activity_other = EXCLUDED.activity_other,
       building_condition = EXCLUDED.building_condition,
       surveyor_id = EXCLUDED.surveyor_id,
       surveyed_at = now(),
       survey_lat = EXCLUDED.survey_lat,
       survey_lon = EXCLUDED.survey_lon,
       updated_at = now()
     RETURNING *`,
    [
      input.shop_id,
      input.shop_name ?? null,
      input.activity,
      input.activity_other ?? null,
      input.building_condition,
      surveyorId,
      input.survey_lat ?? null,
      input.survey_lon ?? null
    ]
  );

  const survey = result.rows[0];
  logger.info(isUpdate ? 'survey.updated' : 'survey.created', {
    shopId: input.shop_id,
    surveyorId,
    surveyedAt: survey.surveyed_at
  });
  // Assignment completion is bookkeeping and must never make an otherwise
  // valid, GPS-independent survey save fail.
  try {
    await completeAssignmentsForShop(input.shop_id);
  } catch (err) {
    logger.error('assignment.completion.failed', {
      shopId: input.shop_id,
      message: (err as Error).message
    });
  }

  // GitHub backup is async and must never break the survey write.
  maybeAutoSync().catch((err) => {
    logger.error('github.sync.failed', { message: (err as Error).message, stage: 'auto-sync' });
  });

  return { survey, created: !isUpdate };
}

export async function listSurveys() {
  const result = await pool.query(
    `SELECT sv.*, u.username AS surveyor_username
     FROM surveys sv
     LEFT JOIN users u ON u.id = sv.surveyor_id
     ORDER BY sv.updated_at DESC`
  );
  return result.rows;
}
