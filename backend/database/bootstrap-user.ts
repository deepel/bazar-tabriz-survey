import { pool } from '../src/db';
import { logger } from '../src/logger';
import { hashPassword } from '../src/services/auth.service';
import { assignmentColorForUserId } from '../src/services/assignment.service';

/**
 * Interactive production user bootstrap.
 *
 * Creates ONE real production user (admin or surveyor). Credentials are read
 * interactively with hidden input and are NEVER printed, logged or written to
 * any file. Passwords are hashed with the same bcrypt mechanism the app uses
 * at login (auth.service.hashPassword).
 *
 * Usage:
 *   tsx database/bootstrap-user.ts --role admin
 *   tsx database/bootstrap-user.ts --role surveyor
 *
 * The password is prompted twice (password + confirmation) and must match.
 * Nothing about the password (not even its hash) is written to system_logs.
 */

type Role = 'admin' | 'surveyor';

interface ReadlinePromisesModule {
  createInterface(options: {
    input: unknown;
    output: unknown;
    terminal?: boolean;
  }): ReadlinePromisesInterface;
}

interface ReadlinePromisesInterface {
  question(prompt: string, options?: { hidden?: boolean }): Promise<string>;
  close(): void;
}

async function readlinePromises(): Promise<ReadlinePromisesModule> {
  return (await import('node:readline' as string)) as unknown as ReadlinePromisesModule;
}

async function promptHidden(label: string, rl: ReadlinePromisesInterface): Promise<string> {
  return rl.question(`${label} (input hidden): `, { hidden: true });
}

async function main(): Promise<void> {
  const roleArg = process.argv
    .find((arg) => arg.startsWith('--role='))
    ?.split('=')[1];
  const roleIndex = process.argv.indexOf('--role');
  const rawRole = roleArg ?? (roleIndex >= 0 ? process.argv[roleIndex + 1] : undefined) ?? 'admin';
  if (rawRole !== 'admin' && rawRole !== 'surveyor') {
    console.error(`نقش نامعتبر: ${rawRole} (فقط admin یا surveyor مجاز است).`);
    process.exit(2);
  }
  const role: Role = rawRole;

  const readline = await readlinePromises();
  const rl = readline.createInterface({
    input: process.stdin,
    output: process.stdout,
    terminal: true
  });

  try {
    const username = (await rl.question('Username: ')).trim();
    if (!/^[a-zA-Z0-9_.-]{1,64}$/.test(username)) {
      console.error('نام کاریری نامعتبر است (فقط حروف، اعداد و -_. با حداکثر ۶۴ حرف).');
      process.exit(2);
    }

    const existing = await pool.query('SELECT 1 FROM users WHERE username = $1', [username]);
    if ((existing.rowCount ?? 0) > 0) {
      console.error(`کاریری "${username}" از قبل وجود دارد.`);
      process.exit(2);
    }

    const password = await promptHidden('Password', rl);
    const confirmation = await promptHidden('Confirm password', rl);

    if (password.length < 8) {
      console.error('رمز عبور باید حداکثر ۸ حرف باشد.');
      process.exit(2);
    }
    if (password !== confirmation) {
      console.error('تأیید رمز عبور مطابق نیست.');
      process.exit(2);
    }

    const hash = await hashPassword(password);
    // Deliberately drop the plain password references before any further work.
    const inserted = await pool.query<{ id: number }>(
      'INSERT INTO users (username, password_hash, role) VALUES ($1,$2,$3) RETURNING id',
      [username, hash, role]
    );
    const userId = inserted.rows[0].id;
    await pool.query('UPDATE users SET assignment_color = $1 WHERE id = $2', [
      assignmentColorForUserId(userId),
      userId
    ]);

    logger.info('user.bootstrap.created', { userId, username, role });
    console.log(`کاریری "${username}" با نقش ${role} ساخه شد.`);
  } finally {
    rl.close();
    await pool.end();
  }
}

main().catch(async (err) => {
  logger.error('user.bootstrap.failed', { message: (err as Error).message });
  await pool.end().catch(() => undefined);
  process.exit(1);
});