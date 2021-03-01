import {
  MemoryTableVersionHistory,
  TableHistoryEntry,
  TableVersionHistory,
  Id,
  commitIdForOperation
} from 'tablevc';
import {equals, moreOrEqual, moreThan, prm, TableDefinition, tbl} from 'yaso';
import {IBaseProtocol} from 'pg-promise';
import {HistoryInit, HistoryOperationType} from '../../tablevc/src';
import {
  deEscapeFromJson,
  EscapedObject,
  escapeForJson
} from './jsonEncoding';

export interface TableHistoryTable<RecordType> {
  _id: Id;
  commitId: string;
  createdAt: Date;
  historyEntry: TableHistoryEntry<RecordType>;
}

export interface PgTableVersionHistoryCreateProps<RecordType> {
  pgDb: IBaseProtocol<any>;
  historyTblDef: TableDefinition<TableHistoryTable<RecordType>>;
  fromCommitId?: string;
  who?: Id;
}

export class PgTableVersionHistory<RecordType>
  extends MemoryTableVersionHistory<RecordType>
  implements TableVersionHistory<RecordType> {
  private historyTblDef: TableDefinition<TableHistoryTable<RecordType>>;
  private pgDb: IBaseProtocol<any>;
  private who?: Id;

  static async loadOrInitFromDb<RecordType>({
    pgDb,
    fromCommitId,
    historyTblDef,
    who
  }: PgTableVersionHistoryCreateProps<RecordType>): Promise<PgTableVersionHistory<RecordType>> {
    let minLogTblId: null | Id = null;
    if (fromCommitId) {
      const historyEntries = await loadHistoryEntries(
        pgDb,
        historyTblDef,
        fromCommitId
      );
      if (historyEntries.length === 0) {
        throw new Error('Unexpected empty list of history entries');
      }
      return new PgTableVersionHistory<RecordType>({
        historyTblDef,
        pgDb,
        historyEntries,
        who
      });
    } else {
      // We initialize the empty history table
      const historyEntries = await loadHistoryEntries(pgDb, historyTblDef);
      if (historyEntries.length === 0) {
        const baseInitOp: Omit<HistoryInit, 'commitId'> = {
          __typename: HistoryOperationType.HISTORY_INIT,
          when: new Date(),
          who
        };
        const initOp: HistoryInit = {
          ...baseInitOp,
          commitId: commitIdForOperation(baseInitOp)
        };
        await pgDb.tx(db =>
          insertLogRecord(db, historyTblDef, initOp.commitId, initOp)
        );
        return new PgTableVersionHistory({
          historyTblDef,
          pgDb,
          historyEntries: [initOp],
          who
        });
      } else {
        return new PgTableVersionHistory<RecordType>({
          historyTblDef,
          pgDb,
          historyEntries,
          who
        });
      }
    }
  }

  constructor({
    historyTblDef,
    pgDb,
    historyEntries = [],
    who
  }: {
    pgDb: IBaseProtocol<any>;
    historyTblDef: TableDefinition<TableHistoryTable<RecordType>>;
    historyEntries: TableHistoryEntry<RecordType>[];
    who?: Id;
  }) {
    super(historyEntries);
    this.historyTblDef = historyTblDef;
    this.pgDb = pgDb;
    this.who = who;
  }

  public push = async (
    entry: TableHistoryEntry<RecordType>
  ): Promise<number> => {
    return this.pgDb.tx(async db => {
      await insertLogRecord(db, this.historyTblDef, entry.commitId, entry);
      await super.push(entry);
      return this.length;
    });
  }

  public refreshFromStorage = async () => {
    const lastCommitId = this.lastCommitId();
    if (lastCommitId) {
      const addedEntries = await loadHistoryEntries(this.pgDb, this.historyTblDef, lastCommitId);
      for (const entry of addedEntries) {
        if (this.indexOf(entry.commitId) === -1) {
          await super.push(entry);
        }
      }
    }
    return this.length;
  }
}

async function insertLogRecord<RecordType>(
  db: IBaseProtocol<any>,
  historyTblDef: TableDefinition<TableHistoryTable<RecordType>>,
  commitId: string,
  historyEntry: TableHistoryEntry<RecordType>
) {
  const addSql = tbl(historyTblDef).insertQrySql(hTbl => ({
    fields: {
      commitId: prm('commitId'),
      historyEntry: prm('historyEntry')
    }
  }));
  return db.none(addSql, {
    commitId,
    historyEntry: escapeForJson(historyEntry)
  });
}

async function loadHistoryEntries<RecordType>(
  pgDb: IBaseProtocol<any>,
  historyTblDef: TableDefinition<TableHistoryTable<RecordType>>,
  fromCommitId?: string
): Promise<TableHistoryEntry<RecordType>[]> {
  let sql: string;
  if (fromCommitId) {
    let minLogTblId: Id | null = null;
    const minIdRec = await pgDb.task<{_id: Id}>(db =>
      db.one(
        tbl(historyTblDef).selectQry(hTbl2 => ({
          fields: [hTbl2.cols._id],
          where: equals(hTbl2.cols.commitId, prm('commitId'))
        }))
      )
    );
    minLogTblId = minIdRec._id;
    sql = tbl(historyTblDef).selectQrySql(hTbl => ({
      where: moreOrEqual(hTbl.cols._id, minLogTblId),
      orderByFields: [{field: hTbl.cols._id}]
    }));
  } else {
    sql = tbl(historyTblDef).selectQrySql(hTbl => ({
      orderByFields: [{field: hTbl.cols._id}]
    }));
  }
  const historyEntries = await pgDb.task<
    EscapedObject<TableHistoryEntry<RecordType>>[]
  >(db => db.any(sql, fromCommitId ? {fromCommitId} : {}));
  return historyEntries.map(entry =>
    deEscapeFromJson(entry)
  ) as TableHistoryEntry<RecordType>[];
}
