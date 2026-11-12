import { randomBytes } from 'node:crypto';
import {
  BadRequestException,
  ForbiddenException,
  Inject,
  Injectable,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import type { Logger as PinoLogger } from 'pino';
import { z } from 'zod';
import { ShopifyRefusedError } from '../access-tokens/shopify-refused.error.js';
import { ShopifyTokenClient } from '../access-tokens/shopify-token-client.js';
import { APPLICATION_LOGGER } from '../common/logging/logger.js';
import type { Env } from '../config/env.schema.js';
import {
  type NewCredentials,
  StoresRepository,
} from '../stores/stores.repository.js';
import { createShopifyAuthorizeUrl } from './create-shopify-authorize-url.js';
import { isShopDomain } from './is-shop-domain.js';
import { hasRequestedScopes } from './requested-scopes.js';
import { type ShopDetails, ShopifyShopClient } from './shopify-shop-client.js';
import { verifyShopifyHmac } from './verify-shopify-hmac.js';

const LOG_CONTEXT = 'InstallationService';
const STATE_BYTES = 32;
const START_AGAIN = 'Start the install again from your Shopify admin.';

const callbackSchema = z.object({
  code: z.string().min(1),
  hmac: z.string().min(1),
  state: z.string().min(1),
  timestamp: z.string().min(1),
});

export interface StartedInstallation {
  readonly state: string;
  readonly authorizeUrl: string;
}

interface VerifiedCallback {
  readonly shopDomain: string;
  readonly code: string;
}

@Injectable()
export class InstallationService {
  constructor(
    private readonly config: ConfigService<Env, true>,
    private readonly storesRepository: StoresRepository,
    @Inject(ShopifyTokenClient)
    private readonly tokenClient: Pick<
      ShopifyTokenClient,
      'exchangeAuthorizationCode'
    >,
    @Inject(ShopifyShopClient)
    private readonly shopClient: Pick<ShopifyShopClient, 'fetchShopDetails'>,
    @Inject(APPLICATION_LOGGER) private readonly logger: PinoLogger,
  ) {}

  startStoreInstallation(shop: unknown): StartedInstallation {
    const state = randomBytes(STATE_BYTES).toString('hex');
    const authorizeUrl = createShopifyAuthorizeUrl({
      shopDomain: requireShopDomain(shop),
      clientId: this.config.get('SHOPIFY_CLIENT_ID'),
      callbackUrl: this.config.get('SHOPIFY_CALLBACK_URL'),
      state,
    });
    return { state, authorizeUrl };
  }

  async installStore(
    query: Record<string, unknown>,
    cookieState: string | undefined,
  ): Promise<ShopDetails> {
    const { shopDomain, code } = this.requireVerifiedCallback(
      query,
      cookieState,
    );
    const credentials = await this.exchangeAuthorizationCode(shopDomain, code);
    requireRequestedScopes(credentials);
    const shop = await this.shopClient.fetchShopDetails(
      shopDomain,
      credentials.accessToken,
    );
    const { storeId, reinstalled } = await this.storesRepository.installStore({
      store: { ...shop, installedAt: new Date() },
      credentials,
    });
    this.logger.info(
      {
        context: LOG_CONTEXT,
        storeId,
        shopDomain: shop.shopDomain,
        reinstalled,
      },
      'store installed',
    );
    return shop;
  }

  private requireVerifiedCallback(
    query: Record<string, unknown>,
    cookieState: string | undefined,
  ): VerifiedCallback {
    const shopDomain = requireShopDomain(query.shop);
    const callback = callbackSchema.safeParse(query);
    if (!callback.success) {
      throw new BadRequestException(
        `This install link is incomplete. ${START_AGAIN}`,
      );
    }
    if (!verifyShopifyHmac(query, this.config.get('SHOPIFY_CLIENT_SECRET'))) {
      throw new ForbiddenException(
        `This install link was not signed by Shopify. ${START_AGAIN}`,
      );
    }
    if (callback.data.state !== cookieState) {
      throw new ForbiddenException(
        `This install link has expired or was opened in another browser. ${START_AGAIN}`,
      );
    }
    return { shopDomain, code: callback.data.code };
  }

  private async exchangeAuthorizationCode(
    shopDomain: string,
    code: string,
  ): Promise<NewCredentials> {
    try {
      return await this.tokenClient.exchangeAuthorizationCode(shopDomain, code);
    } catch (error) {
      if (error instanceof ShopifyRefusedError) {
        throw new ForbiddenException(
          `Shopify refused this install. ${START_AGAIN}`,
          { cause: error },
        );
      }
      throw error;
    }
  }
}

function requireShopDomain(shop: unknown): string {
  if (!isShopDomain(shop)) {
    throw new BadRequestException(
      `The shop address must look like example.myshopify.com. ${START_AGAIN}`,
    );
  }
  return shop;
}

function requireRequestedScopes({ scopes }: NewCredentials): void {
  if (!hasRequestedScopes(scopes)) {
    throw new ForbiddenException(
      'The app needs read access to products and orders. Start the install again and approve all requested access.',
    );
  }
}
