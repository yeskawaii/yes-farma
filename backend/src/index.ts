import { env } from './config/env';
import { createApp } from './app/app';
import { buildCompositionRoot, AppCompositionRoot } from './app/compositionRoot';

export interface ServerInstance {
  server: any;
  composition: AppCompositionRoot;
}

export const startServer = async (): Promise<ServerInstance> => {
  const composition = buildCompositionRoot();
  const app = createApp(composition);

  const server = app.listen(env.PORT, () => {
    console.log(`🚀 Server running in ${env.NODE_ENV} mode on port ${env.PORT}`);
  });

  if (composition.workerRuntime?.isEnabled) {
    try {
      await composition.workerRuntime.start();
    } catch (err: unknown) {
      console.error(
        'Failed to start notification worker runtime:',
        err instanceof Error ? err.message : 'UNKNOWN_ERROR'
      );
    }
  }

  let shuttingDown = false;
  const gracefulShutdown = async (signal: string) => {
    if (shuttingDown) return;
    shuttingDown = true;
    console.log(`Received ${signal}, shutting down gracefully...`);

    server.close(async () => {
      try {
        if (composition.workerRuntime) {
          await composition.workerRuntime.stop();
        }
      } catch (err: unknown) {
        console.error(
          'Error during worker shutdown:',
          err instanceof Error ? err.message : 'UNKNOWN_ERROR'
        );
      }
      process.exit(0);
    });
  };

  process.on('SIGTERM', () => gracefulShutdown('SIGTERM'));
  process.on('SIGINT', () => gracefulShutdown('SIGINT'));

  return { server, composition };
};

if (require.main === module) {
  void startServer();
}
