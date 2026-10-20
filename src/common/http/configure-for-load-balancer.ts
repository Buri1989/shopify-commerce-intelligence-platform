import type { INestApplication } from '@nestjs/common';
import type { Express } from 'express';
import type { Server } from 'node:http';

export function configureForLoadBalancer(app: INestApplication): void {
  const server: Server = app.getHttpServer();
  server.keepAliveTimeout = KEEP_ALIVE_TIMEOUT_MS;
  server.headersTimeout = HEADERS_TIMEOUT_MS;

  const express: Express = app.getHttpAdapter().getInstance();
  express.set('trust proxy', TRUSTED_PROXY_HOPS);
}

// The load balancer keeps an idle connection for 60 s and reuses it; with
// Node's 5 s default the app closes one the balancer is about to use and the
// client gets a 502. Node requires headersTimeout above keepAliveTimeout.
// Paired with the balancer's idle timeout in infra/lib/app/create-load-balancer.ts.
const KEEP_ALIVE_TIMEOUT_MS = 65_000;
const HEADERS_TIMEOUT_MS = 66_000;

// The balancer is the one hop that sets X-Forwarded-*, and the app security
// group accepts traffic from nothing else.
const TRUSTED_PROXY_HOPS = 1;
