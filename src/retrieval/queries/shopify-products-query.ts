import { graphql } from '../graphql.js';

export const PRODUCTS_QUERY = graphql`
  query ($after: String) {
    products(first: 250, after: $after) {
      nodes {
        id
        title
        handle
        vendor
        productType
        status
      }
      pageInfo {
        hasNextPage
        endCursor
      }
    }
  }
`;
