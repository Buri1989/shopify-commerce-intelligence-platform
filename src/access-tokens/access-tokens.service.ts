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

  async getStoreAccessToken(storeId: number): Promise<string> {
    const credentials =
      await this.storesRepository.findStoreCredentials(storeId);
    if (credentials === undefined) {
      throw new StoreMustAuthorizeError(storeId);
    }
    if (!isExpiring(credentials)) {
      return credentials.accessToken;
    }
    return this.refreshStoreAccessToken(credentials);
  }

  private async refreshStoreAccessToken({
    storeId,
    refreshToken,
  }: StoreCredentials): Promise<string> {
    try {
      const refreshed = await this.storesRepository.refreshStoreCredentials(
        storeId,
        (locked) => this.exchangeRefreshTokenIfExpiring(locked),
      );
      if (refreshed === undefined) {
        throw new StoreMustAuthorizeError(storeId);
      }
      return refreshed.accessToken;
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
