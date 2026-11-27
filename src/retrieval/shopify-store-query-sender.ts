import { Inject, Injectable } from '@nestjs/common';
import { AccessTokensService } from '../access-tokens/access-tokens.service.js';
import { StoreMustAuthorizeError } from '../common/errors/store-must-authorize.error.js';
import type { ShopifyAdminAnswer } from './read-shopify-admin-answer.js';
import {
  type QueryVariables,
  sendShopifyAdminQuery,
} from './send-shopify-admin-query.js';
import { ShopifyAccessDeniedError } from './shopify-access-denied.error.js';

@Injectable()
export class ShopifyStoreQuerySender {
  constructor(
    @Inject(AccessTokensService)
    private readonly accessTokens: Pick<AccessTokensService, 'getStoreAccess'>,
  ) {}

  async sendStoreQuery(
    storeId: number,
    query: string,
    variables: QueryVariables,
  ): Promise<ShopifyAdminAnswer> {
    const access = await this.accessTokens.getStoreAccess(storeId);
    try {
      return await sendShopifyAdminQuery(access, query, variables);
    } catch (error) {
      if (!(error instanceof ShopifyAccessDeniedError)) {
        throw error;
      }
      throw new StoreMustAuthorizeError(storeId, error.message);
    }
  }
}
