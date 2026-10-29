import { getTableName } from 'drizzle-orm';
import type { MySqlTable } from 'drizzle-orm/mysql-core';
import {
  createErd,
  type Erd,
  type ErdEntity,
  type ErdMark,
  type ErdRelationship,
} from './erd.js';
import {
  readColumnNames,
  readColumnTypes,
  readForeignKeys,
  readNullableColumns,
  readPrimaryKey,
  readUniqueIndexes,
} from './table-queries.js';

export function mapTablesToErd(tables: readonly MySqlTable[]): Erd {
  return createErd(
    tables.map(mapTableToEntity),
    tables.flatMap(mapTableToRelationships),
  );
}

export function mapTableToEntity(table: MySqlTable): ErdEntity {
  const types = readColumnTypes(table);
  const readMarks = createMarkReader(table);
  return {
    name: getTableName(table),
    attributes: readColumnNames(table).map((name) => ({
      type: readBaseType(types[name]),
      name,
      marks: readMarks(name),
    })),
  };
}

export function mapTableToRelationships(table: MySqlTable): ErdRelationship[] {
  const primaryKey = readPrimaryKey(table);
  const nullableColumns = readNullableColumns(table);
  return readForeignKeys(table).map((foreignKey) => ({
    parent: foreignKey.references.table,
    child: getTableName(table),
    parentRequired: foreignKey.columns.every(
      (column) => !nullableColumns.includes(column),
    ),
    oneChild: isSameColumnSet(foreignKey.columns, primaryKey),
  }));
}

// The drawing marks a column UK only when it is unique on its own; a pair
// rule such as (store_id, shopify_id) is not drawn.
function createMarkReader(table: MySqlTable): (column: string) => ErdMark[] {
  const rules: readonly (readonly [ErdMark, readonly string[]])[] = [
    ['PK', readPrimaryKey(table)],
    ['FK', readForeignKeys(table).flatMap((foreignKey) => foreignKey.columns)],
    ['UK', readUniqueIndexes(table).flatMap(readSingleColumn)],
  ];
  return (column) =>
    rules
      .filter(([, columns]) => columns.includes(column))
      .map(([mark]) => mark);
}

function readSingleColumn(index: { readonly columns: readonly string[] }) {
  return index.columns.length === 1 ? index.columns : [];
}

function readBaseType(sqlType: string): string {
  return sqlType.replace(/[ (].*$/, '');
}

function isSameColumnSet(
  left: readonly string[],
  right: readonly string[],
): boolean {
  return [...left].sort().join(',') === [...right].sort().join(',');
}
