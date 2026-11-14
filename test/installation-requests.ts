import type { INestApplication } from '@nestjs/common';
import request, { type Response, type Test } from 'supertest';
import type { App } from 'supertest/types.js';
import {
  type CallbackParameters,
  signShopifyCallback,
} from './shopify-hmac.js';

export const CALLBACK_CODE = 'code-7f3a9c';

const CLIENT_SECRET = 'test-client-secret';
const CALLBACK_TIMESTAMP = '1767225600';

export interface StartedInstallation {
  readonly state: string;
  readonly stateCookie: string;
}

export async function installShop(
  app: INestApplication<App>,
  shopDomain: string,
): Promise<Response> {
  const { state, stateCookie } = await startInstallation(app, shopDomain);
  return sendCallback(app, createCallbackQuery(shopDomain, state), stateCookie);
}

export async function startInstallation(
  app: INestApplication<App>,
  shopDomain: string,
): Promise<StartedInstallation> {
  const response = await request(app.getHttpServer())
    .get('/installation/start')
    .query({ shop: shopDomain })
    .expect(302);
  const state = readAuthorizeUrl(response).searchParams.get('state') ?? '';
  const [stateCookie] = readStateSetCookie(response).split(';');
  return { state, stateCookie };
}

export function sendCallback(
  app: INestApplication<App>,
  query: CallbackParameters,
  stateCookie?: string,
): Test {
  const callback = request(app.getHttpServer())
    .get('/installation/callback')
    .query(query);
  return stateCookie === undefined
    ? callback
    : callback.set('Cookie', stateCookie);
}

export function createCallbackQuery(
  shopDomain: string,
  state: string,
): CallbackParameters {
  return signShopifyCallback(
    {
      code: CALLBACK_CODE,
      shop: shopDomain,
      state,
      timestamp: CALLBACK_TIMESTAMP,
    },
    CLIENT_SECRET,
  );
}

export function withoutParameter(
  query: CallbackParameters,
  name: string,
): CallbackParameters {
  return Object.fromEntries(
    Object.entries(query).filter(([key]) => key !== name),
  );
}

export function readAuthorizeUrl(response: Response): URL {
  return new URL(response.get('Location') ?? '');
}

export function readStateSetCookie(response: Response): string {
  const cookies = response.get('Set-Cookie') ?? [];
  return cookies.find((cookie) => cookie.startsWith('oauth_state=')) ?? '';
}

export function expectNotLogged(entries: unknown[], values: string[]): void {
  const logged = JSON.stringify(entries);
  expect(logged).toContain('/installation/callback');
  values.forEach((value) => expect(logged).not.toContain(value));
}
