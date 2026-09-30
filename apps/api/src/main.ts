import { ValidationPipe } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { NestFactory } from '@nestjs/core';
import helmet from 'helmet';
import { randomUUID } from 'crypto';
import { AppModule } from './app.module';
import { HttpExceptionFilter } from './common/http-exception.filter';

async function bootstrap() {
  const app = await NestFactory.create(AppModule, { rawBody: true });
  const config = app.get(ConfigService);
  app.setGlobalPrefix('v1');
  app.use(helmet({ contentSecurityPolicy: false }));
  app.enableCors({
    origin: (config.get<string>('CORS_ORIGINS') || 'http://localhost:5173,http://localhost:5174,http://localhost:8081,http://127.0.0.1:5173,http://127.0.0.1:5174,http://127.0.0.1:8081').split(','),
    credentials: true,
  });
  app.use((req: { requestId?: string; headers: Record<string, string> }, res: { setHeader: (name: string, value: string) => void }, next: () => void) => {
    req.requestId = req.headers['x-request-id'] || randomUUID();
    res.setHeader('X-Request-Id', req.requestId);
    next();
  });
  app.useGlobalPipes(new ValidationPipe({ whitelist: true, forbidNonWhitelisted: true, transform: true }));
  app.useGlobalFilters(new HttpExceptionFilter());
  const port = Number(config.get('PORT') || 4000);
  await app.listen(port);
}

void bootstrap();
