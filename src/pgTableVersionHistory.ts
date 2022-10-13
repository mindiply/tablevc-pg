import {
  commitIdForOperation,
  HistoryInit,
  HistoryOperationType,
  Id,
  MemoryTableVersionHistory,
  TableHistoryDelta,
  TableHistoryEntry,
  TableMergeDelta,
  TableVersionHistory
} from 'tablevc';
import {equals, moreOrEqual, prm, selectFrom, TableDefinition, tbl} from 'yaso';
import {IBaseProtocol} from 'pg-promise';
import {deEscapeFromJson, EscapedObject, escapeForJson} from './jsonEncoding';
import {PgTableVersionHistoryCreateProps, TableHistoryTable} from './types';

export class PgTableVersionHistory<RecordType>
  implements TableVersionHistory<RecordType>
{
  private historyTblDef: TableDefinition<TableHistoryTable<RecordType>>;
  private pgDb: IBaseProtocol<any>;
  private who?: Id;
  private memoryHistory: MemoryTableVersionHistory<RecordType>;

  static async loadOrInitFromDb<RecordType>({
    pgDb,
    fromCommitId,
    historyTblDef,
    who
  }: PgTableVersionHistoryCreateProps<RecordType>): Promise<
    PgTableVersionHistory<RecordType>
  > {
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
    this.memoryHistory = new MemoryTableVersionHistory(historyEntries);
    this.historyTblDef = historyTblDef;
    this.pgDb = pgDb;
    this.who = who;
  }

  public get length() {
    return this.memoryHistory.length;
  }

  public entries = (afterCommitId: string, toCommitId?: string) =>
    this.memoryHistory.entries(afterCommitId, toCommitId);

  public clear = () => this.memoryHistory.clear();

  public indexOf = (commitId: string) => this.memoryHistory.indexOf(commitId);

  public getByIndex = (index: number) => this.memoryHistory.getByIndex(index);

  public nextCommitIdOf = (commitId: string) =>
    this.memoryHistory.nextCommitIdOf(commitId);

  public previousCommitIdOf = (commitId: string) =>
    this.memoryHistory.previousCommitIdOf(commitId);

  public getHistoryDelta = (fromCommitId: string, toCommitId?: string) =>
    this.memoryHistory.getHistoryDelta(fromCommitId, toCommitId);

  public branch = (untilCommitId?: string) =>
    this.memoryHistory.branch(untilCommitId);

  public mergeInRemoteDelta = (
    historyDelta: TableHistoryDelta<RecordType> | TableMergeDelta<RecordType>
  ) => this.memoryHistory.mergeInRemoteDelta(historyDelta);

  public rebaseWithMergeDelta = (mergeDelta: TableMergeDelta<RecordType>) =>
    this.memoryHistory.rebaseWithMergeDelta(mergeDelta);

  public lastCommitId = () => this.memoryHistory.lastCommitId();

  public push = async (
    entry: TableHistoryEntry<RecordType>
  ): Promise<number> => {
    return this.pgDb.tx(async db => {
      await insertLogRecord(db, this.historyTblDef, entry.commitId, entry);
      await this.memoryHistory.push(entry);
      return this.length;
    });
  };

  public refreshFromStorage = async () => {
    const lastCommitId = this.lastCommitId();
    if (lastCommitId) {
      const addedEntries = await loadHistoryEntries(
        this.pgDb,
        this.historyTblDef,
        lastCommitId
      );
      for (const entry of addedEntries) {
        if (this.memoryHistory.indexOf(entry.commitId) === -1) {
          await this.memoryHistory.push(entry);
        }
      }
    }
    return this.length;
  };
}

async function insertLogRecord<RecordType>(
  db: IBaseProtocol<any>,
  historyTblDef: TableDefinition<TableHistoryTable<RecordType>>,
  commitId: string,
  historyEntry: TableHistoryEntry<RecordType>
) {
  const addSql = tbl(historyTblDef).insertQrySql({
    fields: {
      commitId: prm('commitId'),
      historyEntry: prm('historyEntry')
    }
  });
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
  let needsReverse = false;
  const prms: {fromTalId?: Id} = {};
  if (fromCommitId) {
    const minIdRec = await pgDb.task<{_id: Id}>(db =>
      db.one(
        tbl(historyTblDef).selectQrySql(hTbl2 => ({
          fields: [hTbl2.cols._id],
          where: equals(hTbl2.cols.commitId, prm('fromCommitId'))
        })),
        {fromCommitId}
      )
    );
    prms.fromTalId = minIdRec._id;
    sql = tbl(historyTblDef).selectQrySql(hTbl => ({
      where: moreOrEqual(hTbl.cols._id, prm('fromTalId')),
      orderByFields: [{field: hTbl.cols._id}]
    }));
  } else {
    needsReverse = true;
    sql = selectFrom(
      selectFrom(tbl(historyTblDef), (qry, hTbl) => {
        qry.orderBy({field: hTbl.cols._id, isDesc: true});
      }),
      oQry => {
        oQry.maxRows(10);
      }
    ).toSql();
  }
  const historyEntries = await pgDb.task<
    EscapedObject<TableHistoryTable<RecordType>>[]
  >(db => db.any(sql, prms));
  const entries = historyEntries.map(entry =>
    deEscapeFromJson(entry.historyEntry)
  ) as TableHistoryEntry<RecordType>[];
  return needsReverse ? entries.reverse() : entries;
}
