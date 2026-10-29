import { getTableName, is, SQL } from 'drizzle-orm';
import {
  type ForeignKey,
  getTableConfig,
  type Index,
  MySqlColumn,
  MySqlDialect,
  type MySqlTable,
} from 'drizzle-orm/mysql-core';

export type IndexShape = {
  readonly name: string;
  readonly columns: readonly string[];
};

export type ForeignKeyShape = {
  readonly name: string;
  readonly columns: readonly string[];
  readonly references: {
    readonly table: string;
    readonly columns: readonly string[];
  };
  readonly onDelete: string | undefined;
};

export function readColumnNames(table: MySqlTable): string[] {
  return getTableConfig(table).columns.map((column) => column.name);
}

export function readColumnTypes(table: MySqlTable): Record<string, string> {
  return Object.fromEntries(
    getTableConfig(table).columns.map((column) => [
      column.name,
      column.getSQLType(),
    ]),
  );
}

export function readNullableColumns(table: MySqlTable): string[] {
  return getTableConfig(table)
    .columns.filter((column) => !column.notNull)
    .map((column) => column.name);
}

// Drizzle records a one-column key on the column and a pair key on the table.
export function readPrimaryKey(table: MySqlTable): string[] {
  const { columns, primaryKeys } = getTableConfig(table);
  const [pairKey] = primaryKeys;
  if (pairKey) {
    return pairKey.columns.map((column) => column.name);
  }
  return columns
    .filter((column) => column.primary)
    .map((column) => column.name);
}

export function readAutoIncrementColumns(table: MySqlTable): string[] {
  return getTableConfig(table)
    .columns.filter(
      (column) => 'autoIncrement' in column && column.autoIncrement === true,
    )
    .map((column) => column.name);
}

export function readUniqueIndexes(table: MySqlTable): IndexShape[] {
  return getTableConfig(table)
    .indexes.filter((index) => index.config.unique === true)
    .map(mapIndex);
}

export function readIndexes(table: MySqlTable): IndexShape[] {
  return getTableConfig(table)
    .indexes.filter((index) => index.config.unique !== true)
    .map(mapIndex);
}

export function readForeignKeys(table: MySqlTable): ForeignKeyShape[] {
  return getTableConfig(table).foreignKeys.map(mapForeignKey);
}

export function readDefaults(table: MySqlTable): Record<string, string> {
  return Object.fromEntries(
    getTableConfig(table)
      .columns.filter((column) => column.default !== undefined)
      .map((column) => [column.name, renderDefault(column.default)]),
  );
}

export function readAppUpdatedColumns(table: MySqlTable): string[] {
  return getTableConfig(table)
    .columns.filter((column) => column.onUpdateFn !== undefined)
    .map((column) => column.name);
}

function mapIndex(index: Index): IndexShape {
  return {
    name: index.config.name,
    columns: index.config.columns.map(readIndexColumnName),
  };
}

function readIndexColumnName(column: MySqlColumn | SQL): string {
  if (!is(column, MySqlColumn)) {
    throw new Error(
      'An index on an expression has no column name; the schema indexes plain columns only',
    );
  }
  return column.name;
}

function mapForeignKey(foreignKey: ForeignKey): ForeignKeyShape {
  const { columns, foreignTable, foreignColumns } = foreignKey.reference();
  return {
    name: foreignKey.getName(),
    columns: columns.map((column) => column.name),
    references: {
      table: getTableName(foreignTable),
      columns: foreignColumns.map((column) => column.name),
    },
    onDelete: foreignKey.onDelete,
  };
}

function renderDefault(value: unknown): string {
  return is(value, SQL)
    ? new MySqlDialect().sqlToQuery(value).sql
    : String(value);
}
