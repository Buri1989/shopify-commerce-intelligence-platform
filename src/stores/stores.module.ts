import { Module } from '@nestjs/common';
import { DatabaseModule } from '../database/database.module.js';
import { StoresRepository } from './stores.repository.js';

@Module({
  imports: [DatabaseModule],
  providers: [StoresRepository],
  exports: [StoresRepository],
})
export class StoresModule {}
