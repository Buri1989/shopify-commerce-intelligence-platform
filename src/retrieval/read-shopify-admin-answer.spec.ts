import {
  createDataAnswer,
  EMPTY_PRODUCTS_DATA,
  createErrorAnswer,
  createThrottledAnswer,
} from '../../test/shopify-answers.js';
import { ShopifyUnavailableError } from '../common/errors/shopify-unavailable.error.js';
import {
  isThrottledAnswer,
  readShopifyAdminAnswer,
} from './read-shopify-admin-answer.js';
import { ShopifyAccessDeniedError } from './shopify-access-denied.error.js';

describe('readShopifyAdminAnswer', () => {
  it('returns the data and the requested cost of the query', () => {
    expect(
      readShopifyAdminAnswer(createDataAnswer(EMPTY_PRODUCTS_DATA, 252)),
    ).toEqual({
      data: EMPTY_PRODUCTS_DATA,
      requestedQueryCost: 252,
    });
  });

  it.each(['INTERNAL_SERVER_ERROR', 'SHOP_INACTIVE'])(
    'throws ShopifyUnavailableError when Shopify reports %s',
    (code) => {
      expect(() => readShopifyAdminAnswer(createErrorAnswer(code))).toThrow(
        ShopifyUnavailableError,
      );
    },
  );

  it('throws instead of returning the data when the answer holds data and errors', () => {
    const answer = {
      ...createDataAnswer(EMPTY_PRODUCTS_DATA),
      ...createErrorAnswer('INTERNAL_SERVER_ERROR'),
    };

    expect(() => readShopifyAdminAnswer(answer)).toThrow(
      ShopifyUnavailableError,
    );
  });

  it("throws ShopifyAccessDeniedError with Shopify's message when a scope is missing", () => {
    const message =
      'Access denied for orders field. Required access: `read_orders` access scope.';

    expect(() =>
      readShopifyAdminAnswer(createErrorAnswer('ACCESS_DENIED', message)),
    ).toThrow(new ShopifyAccessDeniedError(message));
  });

  it('judges an answer with several errors by its first', () => {
    const answer = {
      errors: [
        { message: 'Access denied', extensions: { code: 'ACCESS_DENIED' } },
        {
          message: 'Internal error',
          extensions: { code: 'INTERNAL_SERVER_ERROR' },
        },
      ],
    };

    expect(() => readShopifyAdminAnswer(answer)).toThrow(
      ShopifyAccessDeniedError,
    );
  });

  describe('when our query is wrong', () => {
    it.each(['MAX_COST_EXCEEDED', 'undefinedField'])(
      'throws an error that holds the errors when Shopify reports %s',
      (code) => {
        expect(() => readShopifyAdminAnswer(createErrorAnswer(code))).toThrow(
          code,
        );
      },
    );

    it('throws an error that holds the errors when an error carries no code', () => {
      const answer = {
        errors: [{ message: "Field 'nope' doesn't exist on type 'QueryRoot'" }],
      };

      expect(() => readShopifyAdminAnswer(answer)).toThrow(/nope/);
    });

    it('throws an error when a yes from Shopify has no cost', () => {
      expect(() =>
        readShopifyAdminAnswer({ data: EMPTY_PRODUCTS_DATA }),
      ).toThrow(/extensions/);
    });
  });
});

describe('isThrottledAnswer', () => {
  it('is true for an answer Shopify throttled', () => {
    const answer = createThrottledAnswer({
      requestedQueryCost: 300,
      currentlyAvailable: 0,
      restoreRate: 100,
    });

    expect(isThrottledAnswer(answer)).toBe(true);
  });

  it.each([
    { kind: 'data', answer: createDataAnswer(EMPTY_PRODUCTS_DATA) },
    { kind: 'another error', answer: createErrorAnswer('SHOP_INACTIVE') },
  ])('is false for an answer with $kind', ({ answer }) => {
    expect(isThrottledAnswer(answer)).toBe(false);
  });
});
