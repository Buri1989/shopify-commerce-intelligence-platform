import { type Erd, readEntityNames, readErd } from '../../../test/erd.js';
import { mapTablesToErd } from '../../../test/erd-of-tables.js';
import * as schema from './index.js';

const DESIGN_DOCUMENT = new URL(
  '../../../docs/phase-2/task-2.2-design.md',
  import.meta.url,
);

describe('the ERD in the design document', () => {
  let drawing: Erd;
  let code: Erd;

  beforeAll(() => {
    drawing = readErd(DESIGN_DOCUMENT);
    code = mapTablesToErd(Object.values(schema));
  });

  it('draws every table and nothing else', () => {
    expect(readEntityNames(drawing)).toEqual(readEntityNames(code));
  });

  it('draws every column of every table with its type and key marks, in order', () => {
    expect(drawing.entities).toEqual(code.entities);
  });

  it('draws every pointer as a relationship line with its marks, and nothing else', () => {
    expect(drawing.relationships).toEqual(code.relationships);
  });
});
