import cookieParser from 'cookie-parser';
import { NestFactory } from '@nestjs/core';
import { AppModule } from './app.module.js';
import { parseAuthEnv } from './auth/auth.config.js';

async function bootstrap() {
  const app = await NestFactory.create(AppModule);
  const authEnv = parseAuthEnv();
  app.enableCors({ origin: authEnv.WEB_ORIGIN, credentials: true });
  app.use(cookieParser(authEnv.SESSION_SECRET));
  await app.listen(process.env.PORT || 3000);
}
await bootstrap();
