import { Module } from '@nestjs/common';
import { AccessTokensModule } from '../access-tokens/access-tokens.module.js';
import { RetrievalModule } from '../retrieval/retrieval.module.js';
import { StoresModule } from '../stores/stores.module.js';
import { InstallationController } from './installation.controller.js';
import { InstallationService } from './installation.service.js';

@Module({
  imports: [AccessTokensModule, RetrievalModule, StoresModule],
  controllers: [InstallationController],
  providers: [InstallationService],
})
export class InstallationModule {}
