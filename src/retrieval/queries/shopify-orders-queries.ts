import { graphql } from '../graphql.js';

const ORDER_ITEM_FIELDS = graphql`
  id
  title
  variantTitle
  sku
  quantity
  discountedUnitPriceAfterAllDiscountsSet {
    shopMoney {
      amount
    }
  }
  product {
    id
  }
  variant {
    id
  }
`;

export const ORDERS_QUERY = graphql`
  query ($after: String) {
    orders(first: 50, after: $after) {
      nodes {
        id
        name
        currencyCode
        totalPriceSet {
          shopMoney {
            amount
          }
        }
        displayFinancialStatus
        displayFulfillmentStatus
        processedAt
        cancelledAt
        lineItems(first: 15) {
          nodes {
            ${ORDER_ITEM_FIELDS}
          }
          pageInfo {
            hasNextPage
            endCursor
          }
        }
      }
      pageInfo {
        hasNextPage
        endCursor
      }
    }
    shop {
      ianaTimezone
    }
  }
`;

export const ORDER_ITEMS_QUERY = graphql`
  query ($id: ID!, $after: String) {
    order(id: $id) {
      lineItems(first: 250, after: $after) {
        nodes {
          ${ORDER_ITEM_FIELDS}
        }
        pageInfo {
          hasNextPage
          endCursor
        }
      }
    }
  }
`;
