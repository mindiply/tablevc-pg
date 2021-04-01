import {SQLExpression, TableDefinition} from 'yaso';
import {IBaseProtocol} from 'pg-promise';
import {Id, TableHistoryEntry} from 'tablevc';

export interface PgTablePrms<RecordType> {
  tblDef: TableDefinition<RecordType>;
  pgDb: IBaseProtocol<any>;
  keyField: keyof RecordType;
  qryBaseCond?: SQLExpression;
  generateMissingId?: boolean;
}

export interface TableHistoryTable<RecordType> {
  _id: Id;
  commitId: string;
  createdAt: Date;
  historyEntry: TableHistoryEntry<RecordType>;
}

export interface PgVersionedTableCreateProps<RecordType> {
  pgDb: IBaseProtocol<any>;
  baseSqlCondition?: SQLExpression;
  recordTableDef: TableDefinition<RecordType>;
  keyField: keyof RecordType;
  logTableDef: TableDefinition<TableHistoryTable<RecordType>>;
  fromCommitId?: string;
  who?: Id;
}

export interface PgTableVersionHistoryCreateProps<RecordType> {
  pgDb: IBaseProtocol<any>;
  historyTblDef: TableDefinition<TableHistoryTable<RecordType>>;
  fromCommitId?: string;
  who?: Id;
}
