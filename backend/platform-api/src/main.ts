// Bootstrap for the platform. Modules (rosters, rating, replays) come later.
import { NestFactory } from '@nestjs/core';
import { configureApp } from './app';
import { AppModule } from './app.module';
import { readPort } from './config';

async function bootstrap() {
  const app = configureApp(await NestFactory.create(AppModule));
  const port = readPort(process.env.PLATFORM_API_PORT, 3000);
  await app.listen(port, '0.0.0.0');
  console.log(`platform-api listening on port ${port}`);
}

bootstrap();
