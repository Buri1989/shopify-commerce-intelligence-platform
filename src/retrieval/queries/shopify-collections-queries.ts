import { graphql } from '../graphql.js';

export const COLLECTIONS_QUERY = graphql`
  query ($after: String) {
    collections(first: 250, after: $after) {
      nodes {
        id
        title
        handle
      }
      pageInfo {
        hasNextPage
        endCursor
      }
    }
  }
`;

export const COLLECTION_PRODUCTS_QUERY = graphql`
  query ($id: ID!, $after: String) {
    collection(id: $id) {
      products(first: 250, after: $after, sortKey: COLLECTION_DEFAULT) {
        nodes {
          id
        }
        pageInfo {
          hasNextPage
          endCursor
        }
      }
    }
  }
`;
