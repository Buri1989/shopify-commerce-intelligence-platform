import { readFileSync } from 'node:fs';

export type ErdMark = 'PK' | 'FK' | 'UK';

export type ErdAttribute = {
  readonly type: string;
  readonly name: string;
  readonly marks: readonly ErdMark[];
};

export type ErdEntity = {
  readonly name: string;
  readonly attributes: readonly ErdAttribute[];
};

export type ErdRelationship = {
  readonly parent: string;
  readonly child: string;
  readonly parentRequired: boolean;
  readonly oneChild: boolean;
};

export type Erd = {
  readonly entities: readonly ErdEntity[];
  readonly relationships: readonly ErdRelationship[];
};

export function readErd(documentUrl: URL): Erd {
  const diagram = readDiagram(readFileSync(documentUrl, 'utf8'));
  return createErd(parseEntities(diagram), parseRelationships(diagram));
}

// The drawing and the code hand their pieces over in their own order, so an
// ERD is kept sorted and two of them compare as wholes.
export function createErd(
  entities: readonly ErdEntity[],
  relationships: readonly ErdRelationship[],
): Erd {
  return {
    entities: [...entities].sort(byName),
    relationships: [...relationships].sort(byChildThenParent),
  };
}

export function readEntityNames(erd: Erd): string[] {
  return erd.entities.map((entity) => entity.name);
}

function readDiagram(markdown: string): string {
  const diagrams = [...markdown.matchAll(DIAGRAM_PATTERN)].map(
    (match) => match[1],
  );
  if (diagrams.length !== 1) {
    throw new Error(
      `Expected one erDiagram block in the document, found ${diagrams.length}`,
    );
  }
  return diagrams[0];
}

function parseEntities(diagram: string): ErdEntity[] {
  return [...diagram.matchAll(ENTITY_PATTERN)].map(([, name, body]) => ({
    name,
    attributes: readNonEmptyLines(body).map(parseAttribute),
  }));
}

function parseRelationships(diagram: string): ErdRelationship[] {
  return [...diagram.matchAll(RELATIONSHIP_PATTERN)].map(
    ([, parent, parentMark, childMark, child]) => ({
      parent,
      child,
      parentRequired: parentMark === '||',
      oneChild: childMark.endsWith('|'),
    }),
  );
}

function parseAttribute(line: string): ErdAttribute {
  const [type, name, ...marks] = line.trim().split(/[\s,]+/);
  if (!type || !name) {
    throw new Error(`An attribute line needs a type and a name: "${line}"`);
  }
  return { type, name, marks: marks.map(parseMark) };
}

function parseMark(mark: string): ErdMark {
  if (!isMark(mark)) {
    throw new Error(
      `Unknown key mark "${mark}"; the drawing uses PK, FK and UK`,
    );
  }
  return mark;
}

function isMark(value: string): value is ErdMark {
  return (MARKS as readonly string[]).includes(value);
}

function readNonEmptyLines(text: string): string[] {
  return text.split('\n').filter((line) => line.trim() !== '');
}

function byName(left: ErdEntity, right: ErdEntity): number {
  return left.name.localeCompare(right.name);
}

function byChildThenParent(
  left: ErdRelationship,
  right: ErdRelationship,
): number {
  return `${left.child} ${left.parent}`.localeCompare(
    `${right.child} ${right.parent}`,
  );
}

const MARKS: readonly ErdMark[] = ['PK', 'FK', 'UK'];
const DIAGRAM_PATTERN =
  /^```mermaid[ \t]*\n[ \t]*erDiagram[ \t]*\n([\s\S]*?)^```[ \t]*$/gm;
const ENTITY_PATTERN =
  /^[ \t]*(\w+)[ \t]*\{[ \t]*\n([\s\S]*?)^[ \t]*\}[ \t]*$/gm;
const RELATIONSHIP_PATTERN =
  /^[ \t]*(\w+)[ \t]+(\|[|o])--([|o][|{])[ \t]+(\w+)[ \t]*:[ \t]*"[^"]*"[ \t]*$/gm;
