import { Inject, Injectable } from '@nestjs/common';
import { StoreMustAuthorizeError } from '../common/errors/store-must-authorize.error.js';
import {
  type NewCredentials,
  type StoreCredentials,
  StoresRepository,
} from '../stores/stores.repository.js';
import { ShopifyRefusedError } from './shopify-refused.error.js';
import { ShopifyTokenClient } from './shopify-token-client.js';

const REFRESH_MARGIN_MILLISECONDS = 5 * 60 * 1000;

export type StoreAccess = Pick<StoreCredentials, 'shopDomain' | 'accessToken'>;

@Injectable()
export class AccessTokensService {
  constructor(
    private readonly storesRepository: StoresRepository,
    @Inject(ShopifyTokenClient)
    private readonly tokenClient: Pick<
      ShopifyTokenClient,
      'exchangeRefreshToken'
    >,
  ) {}

  async getStoreAccess(storeId: number): Promise<StoreAccess> {
    const credentials =
      await this.storesRepository.findStoreCredentials(storeId);
    if (credentials === undefined) {
      throw new StoreMustAuthorizeError(storeId);
    }
    if (!isExpiring(credentials)) {
      return createStoreAccess(credentials);
    }
    return this.refreshStoreAccess(credentials);
  }

  private async refreshStoreAccess({
    storeId,
    refreshToken,
  }: StoreCredentials): Promise<StoreAccess> {
    try {
      const refreshed = await this.storesRepository.refreshStoreCredentials(
        storeId,
        (locked) => this.exchangeRefreshTokenIfExpiring(locked),
      );
      if (refreshed === undefined) {
        throw new StoreMustAuthorizeError(storeId);
      }
      return createStoreAccess(refreshed);
    } catch (error) {
      if (!(error instanceof ShopifyRefusedError)) {
        throw error;
      }
      await this.storesRepository.deleteStoreCredentials(storeId, refreshToken);
      throw new StoreMustAuthorizeError(storeId);
    }
  }

  private async exchangeRefreshTokenIfExpiring(
    locked: StoreCredentials,
  ): Promise<NewCredentials | undefined> {
    if (!isExpiring(locked)) {
      return undefined;
    }
    return this.tokenClient.exchangeRefreshToken(
      locked.shopDomain,
      locked.refreshToken,
    );
  }
}

function isExpiring({ expiresAt }: StoreCredentials): boolean {
  return expiresAt.getTime() - Date.now() <= REFRESH_MARGIN_MILLISECONDS;
}

function createStoreAccess({
  shopDomain,
  accessToken,
}: StoreCredentials): StoreAccess {
  return { shopDomain, accessToken };
}
