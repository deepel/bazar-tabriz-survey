import type { FastifyInstance } from 'fastify';
import { pool } from '../db';
import { authenticate, requireAdmin } from '../middleware/auth';
import { AppError, sendFriendlyError } from '../utils/errors';

const MESSAGE_MAX_LENGTH = 2000;

interface SendMessageBody {
  recipient_id?: number;
  to_all?: boolean;
  body?: string;
}

export function registerMessageRoutes(app: FastifyInstance): void {
  app.get(
    '/api/messages',
    { preHandler: [authenticate] },
    async (request) => {
      const userId = request.user!.id;
      const result = await pool.query(
        `SELECT m.id, m.sender_id, s.username AS sender_username,
                m.is_broadcast, m.body, m.is_read, m.created_at
         FROM messages m
         JOIN users s ON s.id = m.sender_id
         WHERE m.recipient_id = $1
         ORDER BY m.created_at DESC, m.id DESC`,
        [userId]
      );
      const unread = await pool.query(
        'SELECT COUNT(*)::int AS n FROM messages WHERE recipient_id = $1 AND is_read = FALSE',
        [userId]
      );
      return { messages: result.rows, unread: Number(unread.rows[0].n) };
    }
  );

  app.post(
    '/api/messages/read-all',
    { preHandler: [authenticate] },
    async (request) => {
      await pool.query(
        `UPDATE messages SET is_read = TRUE, read_at = now()
         WHERE recipient_id = $1 AND is_read = FALSE`,
        [request.user!.id]
      );
      return { ok: true };
    }
  );

  app.post<{ Body: SendMessageBody }>(
    '/api/admin/messages',
    {
      preHandler: [requireAdmin],
      schema: {
        body: {
          type: 'object',
          required: ['body'],
          additionalProperties: false,
          properties: {
            recipient_id: { type: 'number', minimum: 1 },
            to_all: { type: 'boolean' },
            body: { type: 'string' }
          }
        }
      }
    },
    async (request, reply) => {
      try {
        const body = request.body!;
        const text = (body.body ?? '').trim();
        if (!text) throw new AppError(400, 'empty_message', 'متن پیام را وارد کنید.');
        if (text.length > MESSAGE_MAX_LENGTH) {
          throw new AppError(400, 'message_too_long', 'متن پیام بیش از حد طولانی است.');
        }

        const toAll = body.to_all === true;
        const senderId = request.user!.id;

        let recipients: Array<{ id: number }> = [];
        if (toAll) {
          const result = await pool.query(
            `SELECT id FROM users WHERE role = 'surveyor' AND is_active = TRUE ORDER BY id`
          );
          recipients = result.rows;
        } else {
          const recipientId = body.recipient_id;
          if (!Number.isInteger(recipientId)) {
            throw new AppError(400, 'bad_recipient', 'گیرنده پیام را انتخاب کنید.');
          }
          const result = await pool.query(
            'SELECT id FROM users WHERE id = $1 AND is_active = TRUE',
            [recipientId]
          );
          if (!result.rowCount) {
            throw new AppError(404, 'recipient_not_found', 'کاربر گیرنده یافت نشد.');
          }
          recipients = result.rows;
        }

        for (const recipient of recipients) {
          await pool.query(
            `INSERT INTO messages (sender_id, recipient_id, is_broadcast, body)
             VALUES ($1, $2, $3, $4)`,
            [senderId, recipient.id, toAll, text]
          );
        }

        return reply.code(201).send({
          ok: true,
          recipients: recipients.length,
          toAll,
          message: toAll
            ? 'پیام برای همه ممیزان ارسال شد.'
            : 'پیام با موفقیت ارسال شد.'
        });
      } catch (err) {
        sendFriendlyError(reply, err);
        return reply;
      }
    }
  );
}