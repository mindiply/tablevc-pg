import {IBaseProtocol} from 'pg-promise';
import {equals, max, sqlIn, TableDefinition, tbl} from 'yaso';
import {TableHistoryTable} from './pgTableVersionHistory';
import {SelectQuery} from 'yaso/lib/query/types';
import {Id, TableHistoryEntry} from '../../tablevc';

export async function loadVersionedTableData<RecordType>({
  pgDb,
  logTableDef,
  recordTableDef,
  sqlIdInSubQry,
  keyField,
  who
}: {
  pgDb: IBaseProtocol<any>;
  recordTableDef: TableDefinition<RecordType>;
  keyField: keyof RecordType;
  logTableDef: TableDefinition<TableHistoryTable<RecordType>>;
  sqlIdInSubQry?: SelectQuery;
  who?: Id;
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
      tbl(logTableDef).selectQrySql(lTbl2 => ({
        fields: [max(lTbl2.cols._id)]
      }))
    )
  }));

  const [data, lastHistoryEntry] = await pgDb.task<
    [RecordType[], TableHistoryEntry<RecordType> | null]
  >(async db => {
    const historyEntry: TableHistoryEntry<RecordType> | null = await db.oneOrNone(
      logEntrySql
    );
    const records = await db.any(recordsSql);
    return [records, historyEntry];
  });
  return {
    data,
    lastHistoryEntry
  };
}
