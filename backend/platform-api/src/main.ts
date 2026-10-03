// Bootstrap for the platform. Modules (accounts, rosters, rating, replays) come later.
import { NestFactory } from '@nestjs/core';
import { AppModule } from './app.module';

async function bootstrap() {
  const app = await NestFactory.create(AppModule);
  const port = Number(process.env.PLATFORM_API_PORT ?? 3000);
  await app.listen(port, '0.0.0.0');
  console.log(`platform-api pronto na porta ${port}`);
}

bootstrap();
