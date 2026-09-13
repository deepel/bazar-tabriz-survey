import { buildApp } from './app';
import { config } from './config';
import { logger } from './logger';

async function main(): Promise<void> {
  const app = await buildApp();
  try {
    await app.listen({ port: config.port, host: '0.0.0.0' });
    logger.info('server.started', { port: config.port, env: config.nodeEnv });
  } catch (err) {
    logger.error('server.failed', { message: (err as Error).message });
    process.exit(1);
  }
}

main();