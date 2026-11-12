import { HttpStatus } from '@nestjs/common';
import { z } from 'zod';
import { ShopifyUnavailableError } from '../common/errors/shopify-unavailable.error.js';
import type { Env } from '../config/env.schema.js';
import type { NewCredentials } from '../stores/stores.repository.js';
import { ShopifyRefusedError } from './shopify-refused.error.js';

export type ShopifyClientSettings = Pick<
  Env,
  'SHOPIFY_CLIENT_ID' | 'SHOPIFY_CLIENT_SECRET'
>;

const ANSWER_TIME_LIMIT_MILLISECONDS = 10_000;
const MILLISECONDS_PER_SECOND = 1000;
const FORM_HEADERS = {
  'Content-Type': 'application/x-www-form-urlencoded',
  Accept: 'application/json',
};

const tokenAnswerSchema = z.object({
  access_token: z.string().min(1),
  scope: z.string(),
  expires_in: z.number().int().positive(),
  refresh_token: z.string().min(1),
  refresh_token_expires_in: z.number().int().positive(),
});

export class ShopifyTokenClient {
  constructor(private readonly settings: ShopifyClientSettings) {}

  async exchangeAuthorizationCode(
    shopDomain: string,
    code: string,
  ): Promise<NewCredentials> {
    const response = await this.postTokenForm(shopDomain, {
      code,
      expiring: '1',
    });
    if (!response.ok) {
      throw new ShopifyRefusedError();
    }
    return readNewCredentials(response);
  }

  async exchangeRefreshToken(
    shopDomain: string,
    refreshToken: string,
  ): Promise<NewCredentials> {
    const response = await this.postTokenForm(shopDomain, {
      grant_type: 'refresh_token',
      refresh_token: refreshToken,
    });
    if (response.status === HttpStatus.UNAUTHORIZED) {
      throw new ShopifyRefusedError();
    }
    if (!response.ok) {
      throw new Error(
        `Shopify answered the token refresh with status ${response.status}. Check the request, the client id and the client secret.`,
      );
    }
    return readNewCredentials(response);
  }

  private async postTokenForm(
    shopDomain: string,
    fields: Record<string, string>,
  ): Promise<Response> {
    const response = await fetch(
      `https://${shopDomain}/admin/oauth/access_token`,
      {
        method: 'POST',
        headers: FORM_HEADERS,
        body: new URLSearchParams({
          client_id: this.settings.SHOPIFY_CLIENT_ID,
          client_secret: this.settings.SHOPIFY_CLIENT_SECRET,
          ...fields,
        }).toString(),
        signal: AbortSignal.timeout(ANSWER_TIME_LIMIT_MILLISECONDS),
      },
    ).catch((cause: unknown) => {
      throw new ShopifyUnavailableError({ cause });
    });
    if (isShopifyUnavailable(response.status)) {
      throw new ShopifyUnavailableError();
    }
    return response;
  }
}

function isShopifyUnavailable(status: number): boolean {
  return (
    status === HttpStatus.TOO_MANY_REQUESTS ||
    status >= HttpStatus.INTERNAL_SERVER_ERROR
  );
}

async function readNewCredentials(response: Response): Promise<NewCredentials> {
  const answer = tokenAnswerSchema.parse(await response.json());
  return {
    accessToken: answer.access_token,
    scopes: answer.scope,
    expiresAt: addSecondsToNow(answer.expires_in),
    refreshToken: answer.refresh_token,
    refreshTokenExpiresAt: addSecondsToNow(answer.refresh_token_expires_in),
  };
}

function addSecondsToNow(seconds: number): Date {
  return new Date(Date.now() + seconds * MILLISECONDS_PER_SECOND);
}
