import { graphql } from './graphql.js';

describe('graphql', () => {
  it('writes a query laid out across lines as one line with single spaces', () => {
    expect(graphql`
      query {
        shop {
          id
          name
        }
      }
    `).toBe('query { shop { id name } }');
  });

  it('puts each fragment in its place', () => {
    const fields = 'id title';

    expect(graphql`nodes { ${fields} }`).toBe('nodes { id title }');
  });
});
