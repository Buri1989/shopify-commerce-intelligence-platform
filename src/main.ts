import { ConfigService } from '@nestjs/config';
import { NestFactory } from '@nestjs/core';
import { AppModule } from './app.module.js';
import { configureApp } from './app.setup.js';
import type { Env } from './config/env.schema.js';

// bufferLogs holds Nest's own startup lines until useLogger swaps in pino,
// so they come out as JSON like everything else.
const app = await NestFactory.create(AppModule, { bufferLogs: true });
configureApp(app);

const config = app.get<ConfigService<Env, true>>(ConfigService);
await app.listen(config.get('PORT'));
