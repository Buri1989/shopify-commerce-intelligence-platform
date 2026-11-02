import { Module } from '@nestjs/common';
import { DatabaseModule } from '../database/database.module.js';
import { OrdersRepository } from './orders.repository.js';

@Module({
  imports: [DatabaseModule],
  providers: [OrdersRepository],
  exports: [OrdersRepository],
})
export class OrdersModule {}
