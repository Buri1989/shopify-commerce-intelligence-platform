import { graphql } from '../graphql.js';

export const PRODUCT_VARIANTS_QUERY = graphql`
  query ($after: String) {
    productVariants(first: 250, after: $after) {
      nodes {
        id
        title
        sku
        price
        position
        product {
          id
        }
      }
      pageInfo {
        hasNextPage
        endCursor
      }
    }
  }
`;
