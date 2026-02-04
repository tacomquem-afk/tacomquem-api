import { buildApp } from './app.js';
import { env } from './config/env.js';
import { startCleanupJob } from './services/storage/cleanup.js';

async function main() {
  const app = await buildApp();

  try {
    await app.listen({ port: env.PORT, host: env.HOST });

    startCleanupJob(app.log);
    app.log.info('Cleanup job started');
  } catch (err) {
    app.log.error(err);
    process.exit(1);
  }
}

main();
