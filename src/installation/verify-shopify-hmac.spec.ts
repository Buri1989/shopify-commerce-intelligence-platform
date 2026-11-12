import { signAsShopify } from '../../test/shopify-hmac.js';
import { verifyShopifyHmac } from './verify-shopify-hmac.js';

const CLIENT_SECRET = 'test-client-secret';
const CALLBACK_PARAMETERS = {
  timestamp: '1767225600',
  state: 'state-value',
  shop: 'example.myshopify.com',
  code: 'authorization-code',
};
const SIGNED_MESSAGE =
  'code=authorization-code&shop=example.myshopify.com&state=state-value&timestamp=1767225600';
const SHOPIFY_HMAC = signAsShopify(SIGNED_MESSAGE, CLIENT_SECRET);

describe('verifyShopifyHmac', () => {
  it('accepts the signature of the other parameters, sorted and joined', () => {
    const query = { ...CALLBACK_PARAMETERS, hmac: SHOPIFY_HMAC };

    expect(verifyShopifyHmac(query, CLIENT_SECRET)).toBe(true);
  });

  it('accepts a signature that covers a parameter the app does not read', () => {
    const query = {
      ...CALLBACK_PARAMETERS,
      host: 'YWRtaW4',
      hmac: signAsShopify(
        'code=authorization-code&host=YWRtaW4&shop=example.myshopify.com&state=state-value&timestamp=1767225600',
        CLIENT_SECRET,
      ),
    };

    expect(verifyShopifyHmac(query, CLIENT_SECRET)).toBe(true);
  });

  it.each([
    { name: 'no hmac', query: CALLBACK_PARAMETERS },
    {
      name: 'a changed parameter',
      query: {
        ...CALLBACK_PARAMETERS,
        shop: 'other.myshopify.com',
        hmac: SHOPIFY_HMAC,
      },
    },
    {
      name: 'an added parameter',
      query: { ...CALLBACK_PARAMETERS, host: 'YWRtaW4', hmac: SHOPIFY_HMAC },
    },
    {
      name: 'a removed parameter',
      query: {
        state: 'state-value',
        shop: 'example.myshopify.com',
        code: 'authorization-code',
        hmac: SHOPIFY_HMAC,
      },
    },
    {
      name: 'a repeated parameter',
      query: {
        ...CALLBACK_PARAMETERS,
        shop: ['example.myshopify.com', 'example.myshopify.com'],
        hmac: SHOPIFY_HMAC,
      },
    },
    {
      name: 'a repeated hmac',
      query: { ...CALLBACK_PARAMETERS, hmac: [SHOPIFY_HMAC, SHOPIFY_HMAC] },
    },
    {
      name: 'an hmac of the wrong length',
      query: { ...CALLBACK_PARAMETERS, hmac: SHOPIFY_HMAC.slice(0, -1) },
    },
    {
      name: 'a signature made with another secret',
      query: {
        ...CALLBACK_PARAMETERS,
        hmac: signAsShopify(SIGNED_MESSAGE, 'another-secret'),
      },
    },
  ])('refuses $name', ({ query }) => {
    expect(verifyShopifyHmac(query, CLIENT_SECRET)).toBe(false);
  });
});
