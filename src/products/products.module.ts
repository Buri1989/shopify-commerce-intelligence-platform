import { Module } from '@nestjs/common';
import { DatabaseModule } from '../database/database.module.js';
import { ProductsRepository } from './products.repository.js';

@Module({
  imports: [DatabaseModule],
  providers: [ProductsRepository],
  exports: [ProductsRepository],
})
export class ProductsModule {}
