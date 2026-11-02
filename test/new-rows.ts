import type {
  NewOrder,
  NewOrderItem,
} from '../src/orders/orders.repository.js';
import type { NewProduct } from '../src/products/products.repository.js';
import type { NewStore } from '../src/stores/stores.repository.js';

let nextShopifyId = 1;

export function createNewStore(): NewStore {
  const shopifyId = nextShopifyId++;
  return {
    shopifyId,
    shopDomain: `shop-${shopifyId}.myshopify.com`,
    name: `Shop ${shopifyId}`,
    currency: 'EUR',
    installedAt: new Date('2026-01-01T00:00:00.000Z'),
  };
}

export function createNewProduct(): NewProduct {
  const shopifyId = nextShopifyId++;
  return {
    shopifyId,
    title: `Product ${shopifyId}`,
    handle: `product-${shopifyId}`,
    status: 'active',
  };
}

export function createNewOrder(): NewOrder {
  const shopifyId = nextShopifyId++;
  return {
    shopifyId,
    name: `#${shopifyId}`,
    currency: 'EUR',
    totalPrice: '10.0000',
    financialStatus: 'paid',
    placedAt: new Date('2026-01-01T00:00:00.000Z'),
    placedOn: '2026-01-01',
  };
}

export function createNewOrderItem(): NewOrderItem {
  const shopifyId = nextShopifyId++;
  return {
    shopifyId,
    title: `Item ${shopifyId}`,
    quantity: 1,
    price: '10.0000',
  };
}

export async function createMany(
  count: number,
  create: (index: number) => Promise<number>,
): Promise<number[]> {
  const ids: number[] = [];
  // One at a time, so the ids rise in the order asked for.
  for (let index = 0; index < count; index++) {
    ids.push(await create(index));
  }
  return ids;
}
