import { graphql } from '../graphql.js';

export const SHOP_QUERY = graphql`
  {
    shop {
      id
      name
      currencyCode
      myshopifyDomain
    }
  }
`;
