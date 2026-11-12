import { Module } from '@nestjs/common';
import { AccessTokensModule } from '../access-tokens/access-tokens.module.js';
import { StoresModule } from '../stores/stores.module.js';
import { InstallationController } from './installation.controller.js';
import { InstallationService } from './installation.service.js';
import { ShopifyShopClient } from './shopify-shop-client.js';

@Module({
  imports: [AccessTokensModule, StoresModule],
  controllers: [InstallationController],
  providers: [ShopifyShopClient, InstallationService],
})
export class InstallationModule {}
