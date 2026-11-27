import { LAST_PAGE_INFO } from './shopify-answers.js';

export const SHOPIFY_ORDER_ITEM = {
  id: 'gid://shopify/LineItem/866550311',
  title: 'Linen shirt',
  variantTitle: 'Large / Blue',
  sku: 'LS-L-BLU',
  quantity: 2,
  discountedUnitPriceAfterAllDiscountsSet: { shopMoney: { amount: '39.92' } },
  product: { id: 'gid://shopify/Product/108828309' },
  variant: { id: 'gid://shopify/ProductVariant/40422183' },
};

export const SHOPIFY_ORDER = {
  id: 'gid://shopify/Order/450789469',
  name: '#1001',
  currencyCode: 'EUR',
  totalPriceSet: { shopMoney: { amount: '84.84' } },
  displayFinancialStatus: 'PAID',
  displayFulfillmentStatus: 'UNFULFILLED',
  processedAt: '2026-11-27T03:30:00Z',
  cancelledAt: null,
  lineItems: { nodes: [SHOPIFY_ORDER_ITEM], pageInfo: LAST_PAGE_INFO },
};

export const ORDER_ITEM_ROW = {
  shopifyId: 866550311,
  title: 'Linen shirt',
  variantTitle: 'Large / Blue',
  sku: 'LS-L-BLU',
  quantity: 2,
  price: '39.92',
  productShopifyId: 108828309,
  variantShopifyId: 40422183,
};

export const ORDER_ROW = {
  shopifyId: 450789469,
  name: '#1001',
  currency: 'EUR',
  totalPrice: '84.84',
  financialStatus: 'PAID',
  fulfillmentStatus: 'UNFULFILLED',
  placedAt: new Date('2026-11-27T03:30:00Z'),
  cancelledAt: null,
  items: [ORDER_ITEM_ROW],
  itemsNextCursor: null,
};

export const PLACED_ORDER_ROW = { ...ORDER_ROW, placedOn: '2026-11-26' };
