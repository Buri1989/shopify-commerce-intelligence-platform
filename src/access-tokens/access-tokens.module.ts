import { Module } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import type { Env } from '../config/env.schema.js';
import { StoresModule } from '../stores/stores.module.js';
import { AccessTokensService } from './access-tokens.service.js';
import { ShopifyTokenClient } from './shopify-token-client.js';

@Module({
  imports: [StoresModule],
  providers: [
    {
      provide: ShopifyTokenClient,
      inject: [ConfigService],
      useFactory: (config: ConfigService<Env, true>) =>
        new ShopifyTokenClient({
          SHOPIFY_CLIENT_ID: config.get('SHOPIFY_CLIENT_ID'),
          SHOPIFY_CLIENT_SECRET: config.get('SHOPIFY_CLIENT_SECRET'),
        }),
    },
    AccessTokensService,
  ],
  exports: [AccessTokensService, ShopifyTokenClient],
})
export class AccessTokensModule {}
