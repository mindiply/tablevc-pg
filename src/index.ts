import {createVersionedTable, Id, Table, TableVersionHistory} from 'tablevc';
import {PgTable, PgTablePrms} from './pgTable';
import {
  PgTableVersionHistory,
  PgTableVersionHistoryCreateProps,
  TableHistoryTable
} from './pgTableVersionHistory';
import {VersionedTable} from '../../tablevc/src';
import {SQLExpression, sqlIn, TableDefinition, tbl} from 'yaso';
import {IBaseProtocol} from 'pg-promise';
export {loadVersionedTableData} from './dataLoad';

export const createPgTable = <RecordType>(
  prms: PgTablePrms<RecordType>
): Table<RecordType> => {
  return new PgTable(prms);
};

export const createPgTableVersionHistory = <RecordType>(
  props: PgTableVersionHistoryCreateProps<RecordType>
): Promise<TableVersionHistory<RecordType>> => {
  return PgTableVersionHistory.loadOrInitFromDb(props);
};

export interface PgVersionedTableCreateProps<RecordType> {
  pgDb: IBaseProtocol<any>;
  baseSqlCondition?: SQLExpression;
  recordTableDef: TableDefinition<RecordType>;
  keyField: keyof RecordType;
  logTableDef: TableDefinition<TableHistoryTable<RecordType>>;
  fromCommitId?: string;
  who?: Id;
}

export async function createPgVersionedTable<RecordType>({
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
    dbType: pgTbl,
    versionHistoryType: history,
    who
  });
  return versionedTable;
}
