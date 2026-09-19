import type { FastifyInstance } from 'fastify';
import { ACTIVITIES, BUILDING_CONDITIONS, FLOORS, INSTAGRAM_STATUSES } from '../config';
import { authenticate } from '../middleware/auth';
import { logger } from '../logger';
import { listSurveys, saveSurvey } from '../services/survey.service';
import { AppError } from '../utils/errors';

interface SurveyBody {
  shop_id: string;
  shop_name?: string;
  activity?: string;
  activity_other?: string;
  building_condition?: string;
  floor?: string;
  instagram_status?: string;
  phone?: string;
  survey_lat?: number;
  survey_lon?: number;
}

export function registerSurveyRoutes(app: FastifyInstance): void {
  app.post<{ Body: SurveyBody }>(
    '/api/surveys',
    {
      preHandler: [authenticate],
      schema: {
        body: {
          type: 'object',
          required: ['shop_id', 'activity', 'building_condition'],
          additionalProperties: false,
          properties: {
            shop_id: { type: 'string', minLength: 1 },
            shop_name: { type: 'string' },
            activity: { type: 'string' },
            activity_other: { type: 'string' },
            building_condition: { type: 'string' },
            floor: { type: 'string' },
            instagram_status: { type: 'string' },
            phone: { type: 'string' },
            survey_lat: { type: 'number' },
            survey_lon: { type: 'number' }
          }
        }
      }
    },
    async (request, reply) => {
      const body = request.body!;
      if (!ACTIVITIES.includes(body.activity as (typeof ACTIVITIES)[number])) {
        logger.warn('survey.failed', { shopId: body.shop_id, userId: request.user!.id, reason: 'invalid_activity' });
        throw new AppError(400, 'invalid_activity', 'نوع فعالیت انتخاب‌شده معتبر نیست.');
      }
      if (body.activity === 'سایر' && !body.activity_other?.trim()) {
        logger.warn('survey.failed', { shopId: body.shop_id, userId: request.user!.id, reason: 'missing_activity_other' });
        throw new AppError(400, 'invalid_activity', 'لطفاً نوع فعالیت را در فیلد «سایر» وارد کنید.');
      }
      if (
        !BUILDING_CONDITIONS.includes(body.building_condition as (typeof BUILDING_CONDITIONS)[number])
      ) {
        logger.warn('survey.failed', { shopId: body.shop_id, userId: request.user!.id, reason: 'invalid_condition' });
        throw new AppError(400, 'invalid_condition', 'وضعیت ساختمان انتخاب‌شده معتبر نیست.');
      }
      const floor = body.floor ?? 'ground_floor';
      const instagramStatus = body.instagram_status ?? 'not_checked';
      if (!FLOORS.includes(floor as (typeof FLOORS)[number])) {
        throw new AppError(400, 'invalid_floor', 'موقعیت عمودی انتخاب‌شده معتبر نیست.');
      }
      if (!INSTAGRAM_STATUSES.includes(instagramStatus as (typeof INSTAGRAM_STATUSES)[number])) {
        throw new AppError(400, 'invalid_instagram_status', 'وضعیت اینستاگرام انتخاب‌شده معتبر نیست.');
      }
      const lat = body.survey_lat;
      const lon = body.survey_lon;

      let survey: Awaited<ReturnType<typeof saveSurvey>>['survey'];
      let created = false;
      try {
        const result = await saveSurvey(request.user!.id, {
          shop_id: body.shop_id,
          shop_name: body.shop_name?.trim() || null,
          activity: body.activity ?? null,
          activity_other: body.activity_other?.trim() || null,
          building_condition: body.building_condition ?? null,
          floor: floor as (typeof FLOORS)[number],
          instagram_status: instagramStatus as (typeof INSTAGRAM_STATUSES)[number],
          phone: body.phone?.trim() || null,
          survey_lat: lat ?? null,
          survey_lon: lon ?? null
        });
        survey = result.survey;
        created = result.created;
      } catch (err) {
        logger.error('survey.failed', {
          shopId: body.shop_id,
          userId: request.user!.id,
          message: (err as Error).message
        });
        throw err;
      }

      return reply.code(created ? 201 : 200).send({
        ok: true,
        created,
        message: 'اطلاعات مغازه با موفقیت ذخیره شد.',
        survey
      });
    }
  );

  app.get(
    '/api/surveys',
    { preHandler: [authenticate] },
    async () => ({ surveys: await listSurveys() })
  );
}
