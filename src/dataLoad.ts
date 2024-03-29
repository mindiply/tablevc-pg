import {IBaseProtocol} from 'pg-promise';
import {equals, max, sqlIn, TableDefinition, tbl} from 'yaso';
import {PgTableVersionHistory} from './pgTableVersionHistory';
import {SelectQuery} from 'yaso/lib/query/types';
import {
  createVersionedTable,
  TableHistoryEntry,
  TableVersionHistory,
  VersionedTable
} from 'tablevc';
import {
  PgTableVersionHistoryCreateProps,
  PgVersionedTableCreateProps,
  TableHistoryTable
} from './types';
import {createPgTable} from './pgTable';
import {deEscapeFromJson} from './jsonEncoding';

export async function loadVersionedTableData<RecordType>({
  pgDb,
  logTableDef,
  recordTableDef,
  sqlIdInSubQry,
  keyField
}: {
  pgDb: IBaseProtocol<any>;
  recordTableDef: TableDefinition<RecordType>;
  keyField: keyof RecordType;
  logTableDef: TableDefinition<TableHistoryTable<RecordType>>;
  sqlIdInSubQry?: SelectQuery;
}): Promise<{
  data: RecordType[];
  lastHistoryEntry: TableHistoryEntry<RecordType> | null;
}> {
  const recordsSql = tbl(recordTableDef).selectQrySql(rTbl => ({
    where: sqlIdInSubQry
      ? sqlIn(rTbl.fields.get(keyField)!, sqlIdInSubQry)
      : undefined
  }));
  const logEntrySql = tbl(logTableDef).selectQrySql(lTbl => ({
    where: equals(
      lTbl.cols._id,
      tbl(logTableDef).selectQry(lTbl2 => ({
        fields: [max(lTbl2.cols._id)]
      }))
    )
  }));

  const [data, lastHistoryEntry] = await pgDb.task<
    [RecordType[], TableHistoryEntry<RecordType> | null]
  >(async (db: IBaseProtocol<any>) => {
    const historyEntry = await db.oneOrNone<TableHistoryTable<RecordType>>(
      logEntrySql
    );
    const records = await db.any(recordsSql);
    return [
      records,
      historyEntry
        ? (deEscapeFromJson(
            historyEntry.historyEntry
          ) as TableHistoryEntry<RecordType>)
        : null
    ];
  });
  return {
    data,
    lastHistoryEntry
  };
}

export async function createPgVersionedTable<
  RecordType extends Record<any, any>
>({
  baseSqlCondition,
  fromCommitId,
  keyField,
  logTableDef,
  pgDb,
  recordTableDef,
  who
}: PgVersionedTableCreateProps<RecordType>): Promise<
  VersionedTable<RecordType>
> {
  const history = await PgTableVersionHistory.loadOrInitFromDb({
    pgDb,
    who,
    fromCommitId,
    historyTblDef: logTableDef
  });
  const pgTbl = await createPgTable({
    keyField,
    pgDb,
    qryBaseCond: baseSqlCondition,
    tblDef: recordTableDef
  });
  const versionedTable = await createVersionedTable({
    tableName: recordTableDef.dbName,
    primaryKey: keyField,
    dbType: pgTbl,
    versionHistoryType: history,
    who
  });
  return versionedTable;
}

export const createPgTableVersionHistory = <RecordType>(
  props: PgTableVersionHistoryCreateProps<RecordType>
): Promise<TableVersionHistory<RecordType>> => {
  return PgTableVersionHistory.loadOrInitFromDb(props);
};
