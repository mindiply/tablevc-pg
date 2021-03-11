import {clearTestDb, initTestDb} from './db/init';
import {getDb} from './db/dbProvider';
import {createPgTable} from '../src';
import {Tst, tstLogTblDef, tstTblDef} from './db/tstTableDef';
import {
  createInMemoryVTChannel,
  createVersionedTable,
  Id,
  pull,
  push
} from 'tablevc';
import {createPgTableVersionHistory} from '../lib';

beforeAll(async () => {
  return initTestDb();
});

afterAll(() => {
  return clearTestDb();
});

const tstRecord = (id: Id): Tst => ({
  _id: String(id),
  when: new Date(),
  name: '',
  amount: 0,
  nullable: null
});

describe('Basic table API', () => {
  beforeEach(async () => {
    const pgDb = await getDb();
    await pgDb.none('delete from tst_log');
    return pgDb.none('delete from tst');
  });

  test('Inserting the first record', async () => {
    const pgDb = await getDb();
    const vt = await createVersionedTable<Tst>({
      tableName: 'tst',
      primaryKey: '_id',
      dbType: createPgTable({
        tblDef: tstTblDef,
        pgDb: pgDb!,
        keyField: '_id'
      }),
      versionHistoryType: await createPgTableVersionHistory({
        pgDb: pgDb!,
        historyTblDef: tstLogTblDef,
        who: 'TESTID'
      })
    });
    const r1 = tstRecord('TEST1');
    await vt.addRecord(r1);
    const dr1 = await vt.tbl.getRecord('TEST1');
    expect(dr1).toEqual(r1);
  });

  test('Inserting and updating the first record', async () => {
    const pgDb = await getDb();
    const vt = await createVersionedTable<Tst>({
      tableName: 'tst',
      primaryKey: '_id',
      dbType: createPgTable({
        tblDef: tstTblDef,
        pgDb: pgDb!,
        keyField: '_id'
      }),
      versionHistoryType: await createPgTableVersionHistory({
        pgDb: pgDb!,
        historyTblDef: tstLogTblDef,
        who: 'TESTID'
      })
    });
    const r1 = tstRecord('TEST1');
    await vt.addRecord(r1);
    const dr1 = await vt.tbl.getRecord('TEST1');
    expect(dr1).toEqual(r1);
    await vt.updateRecord('TEST1', {amount: 9876});
    const udr1 = await vt.tbl.getRecord('TEST1');
    expect(udr1).toEqual({...r1, amount: 9876});
  });

  test('Inserting and deleting a record', async () => {
    const pgDb = await getDb();
    const vt = await createVersionedTable<Tst>({
      tableName: 'tst',
      primaryKey: '_id',
      dbType: createPgTable({
        tblDef: tstTblDef,
        pgDb: pgDb!,
        keyField: '_id'
      }),
      versionHistoryType: await createPgTableVersionHistory({
        pgDb: pgDb!,
        historyTblDef: tstLogTblDef,
        who: 'TESTID'
      })
    });
    const r1 = tstRecord('TEST1');
    await vt.addRecord(r1);
    const dr1 = await vt.tbl.getRecord('TEST1');
    expect(dr1).toEqual(r1);
    await vt.deleteRecord('TEST1');
    const udr1 = await vt.tbl.getRecord('TEST1');
    expect(udr1).toBe(undefined);
  });
});

describe('Synchronizing with memory clients', () => {
  beforeEach(async () => {
    const pgDb = await getDb();
    await pgDb.none('delete from tst_log');
    return pgDb.none('delete from tst');
  });

  describe('Clone from server', () => {
    test('Empty history', async () => {
      const pgDb = await getDb();
      const serverHistory = await createVersionedTable<Tst>({
        primaryKey: '_id',
        tableName: 'tst',
        dbType: createPgTable({
          tblDef: tstTblDef,
          pgDb: pgDb!,
          keyField: '_id'
        }),
        versionHistoryType: await createPgTableVersionHistory({
          pgDb: pgDb!,
          historyTblDef: tstLogTblDef,
          who: 'TESTID'
        })
      });
      const channel = createInMemoryVTChannel(serverHistory);
      const {lastCommitId, rows} = await channel.cloneTable(
        serverHistory.tbl.tableName
      );
      expect(rows.length).toBe(0);
      expect(lastCommitId).toBe(serverHistory.lastCommitId());
    });

    test('A few records', async () => {
      const pgDb = await getDb();
      const serverHistory = await createVersionedTable<Tst>({
        primaryKey: '_id',
        tableName: 'tst',
        dbType: createPgTable({
          tblDef: tstTblDef,
          pgDb: pgDb!,
          keyField: '_id'
        }),
        versionHistoryType: await createPgTableVersionHistory({
          pgDb: pgDb!,
          historyTblDef: tstLogTblDef,
          who: 'TESTID'
        })
      });
      const testRecord = tstRecord('TEST1');
      await serverHistory.addRecord('TEST1', testRecord);
      await serverHistory.addRecord('TEST2', {
        ...testRecord,
        _id: 'TEST2',
        name: 'Test2'
      });
      const channel = createInMemoryVTChannel(serverHistory);
      const {lastCommitId, rows} = await channel.cloneTable(
        serverHistory.tbl.tableName
      );
      expect(rows.length).toBe(2);
      expect(lastCommitId).toBe(serverHistory.lastCommitId());
      const sRow = await serverHistory.tbl.getRecord('TEST1');
      expect(rows[0]).toEqual(sRow);
    });
  });

  describe('Push', () => {
    test('Perform not conflicting synchronization', async () => {
      const pgDb = await getDb();
      const testRecord = tstRecord('TEST1');
      const testRecord2 = tstRecord('TEST2');
      const server = await createVersionedTable<Tst>({
        primaryKey: '_id',
        tableName: 'tst',
        dbType: createPgTable({
          tblDef: tstTblDef,
          pgDb: pgDb!,
          keyField: '_id'
        }),
        versionHistoryType: await createPgTableVersionHistory({
          pgDb: pgDb!,
          historyTblDef: tstLogTblDef,
          who: 'TESTID'
        })
      });
      const channel = createInMemoryVTChannel(server);
      const {lastCommitId, rows} = await channel.cloneTable<Tst>('tst');
      const client = await createVersionedTable<Tst>({
        tableName: 'tst',
        primaryKey: '_id',
        initialData: {
          commitId: lastCommitId,
          data: rows
        }
      });
      await server.addRecord(testRecord._id, testRecord);
      await client.addRecord(testRecord2._id, testRecord2);
      await push(client, channel);

      const serverSize = await server.tbl.size();
      const sr1 = await server.tbl.getRecord('TEST1');
      const sr2 = await server.tbl.getRecord('TEST2');
      expect(serverSize).toBe(2);
      expect(sr1).toEqual(testRecord);
      expect(sr2).toEqual(testRecord2);
      expect(client.syncTbl!.syncSize()).toBe(2);
      expect(client.syncTbl!.syncGetRecord('TEST1')).toEqual(testRecord);
      expect(client.syncTbl!.syncGetRecord('TEST2')).toEqual(testRecord2);
    });

    test('Psuh with cancelled merge', async () => {
      const pgDb = await getDb();
      const testRecord = tstRecord('TEST1');
      const testRecord2 = tstRecord('TEST2');
      const server = await createVersionedTable<Tst>({
        primaryKey: '_id',
        tableName: 'tst',
        dbType: createPgTable({
          tblDef: tstTblDef,
          pgDb: pgDb!,
          keyField: '_id'
        }),
        versionHistoryType: await createPgTableVersionHistory({
          pgDb: pgDb!,
          historyTblDef: tstLogTblDef,
          who: 'TESTID'
        })
      });
      const channel = createInMemoryVTChannel(server);
      const {lastCommitId, rows} = await channel.cloneTable<Tst>('tst');
      const client = await createVersionedTable<Tst>({
        tableName: 'tst',
        primaryKey: '_id',
        initialData: {
          commitId: lastCommitId,
          data: rows
        }
      });
      await server.addRecord(testRecord._id, testRecord);
      await client.addRecord(testRecord2._id, testRecord2);
      await push(client, channel, () => true);

      const serverSize = await server.tbl.size();
      const sr1 = await server.tbl.getRecord('TEST1');
      const sr2 = await server.tbl.getRecord('TEST2');
      expect(serverSize).toBe(2);
      expect(sr1).toEqual(testRecord);
      expect(sr2).toEqual(testRecord2);
      expect(client.syncTbl!.syncSize()).toBe(1);
      expect(client.syncTbl!.syncGetRecord('TEST1')).toBe(undefined);
      expect(client.syncTbl!.syncGetRecord('TEST2')).toEqual(testRecord2);
    });

    test('Perform conflicting concurrent synchronization - change vs delete', async () => {
      const pgDb = await getDb();
      const testRecord = tstRecord('TEST1');
      const testRecord2 = tstRecord('TEST2');
      const server = await createVersionedTable<Tst>({
        primaryKey: '_id',
        tableName: 'tst',
        dbType: createPgTable({
          tblDef: tstTblDef,
          pgDb: pgDb!,
          keyField: '_id'
        }),
        versionHistoryType: await createPgTableVersionHistory({
          pgDb: pgDb!,
          historyTblDef: tstLogTblDef,
          who: 'TESTID'
        })
      });
      await server.addRecord(testRecord._id, testRecord);
      const channel = createInMemoryVTChannel(server);
      const {lastCommitId, rows} = await channel.cloneTable<Tst>('tst');
      const client = await createVersionedTable<Tst>({
        tableName: 'tst',
        primaryKey: '_id',
        initialData: {
          commitId: lastCommitId,
          data: rows
        }
      });
      await client.addRecord(testRecord2._id, testRecord2);
      await client.deleteRecord(testRecord._id);
      await server.updateRecord(testRecord._id, {amount: 251177});
      await push(client, channel);

      const serverSize = await server.tbl.size();
      const sr1 = await server.tbl.getRecord('TEST1');
      const sr2 = await server.tbl.getRecord('TEST2');
      expect(serverSize).toBe(2);
      expect(sr1).toEqual({
        ...testRecord,
        amount: 251177
      });
      expect(sr2).toEqual(testRecord2);
      expect(client.syncTbl!.syncSize()).toBe(2);
      expect(client.syncTbl!.syncGetRecord('TEST1')).toEqual({
        ...testRecord,
        amount: 251177
      });
      expect(client.syncTbl!.syncGetRecord('TEST2')).toEqual(testRecord2);
    });
  });

  describe('Pull', () => {
    test('Null no changes pull', async () => {
      const pgDb = await getDb();
      const server = await createVersionedTable<Tst>({
        primaryKey: '_id',
        tableName: 'tst',
        dbType: createPgTable({
          tblDef: tstTblDef,
          pgDb: pgDb,
          keyField: '_id'
        }),
        versionHistoryType: await createPgTableVersionHistory({
          pgDb: pgDb,
          historyTblDef: tstLogTblDef,
          who: 'TESTID'
        })
      });
      const channel = createInMemoryVTChannel(server);
      const {lastCommitId, rows} = await channel.cloneTable<Tst>('tst');
      const h2 = await createVersionedTable<Tst>({
        tableName: 'tst',
        primaryKey: '_id',
        initialData: {
          commitId: lastCommitId,
          data: rows
        }
      });
      await pull(h2, channel);
      expect(h2.lastCommitId()).toBe(server.lastCommitId());
      expect(h2.syncTbl!.syncSize()).toBe(0);
    });

    test('Some changes to pull', async () => {
      const pgDb = await getDb();
      const server = await createVersionedTable<Tst>({
        primaryKey: '_id',
        tableName: 'tst',
        dbType: createPgTable({
          tblDef: tstTblDef,
          pgDb: pgDb,
          keyField: '_id'
        }),
        versionHistoryType: await createPgTableVersionHistory({
          pgDb: pgDb,
          historyTblDef: tstLogTblDef,
          who: 'TESTID'
        })
      });
      const channel = createInMemoryVTChannel(server);
      const {lastCommitId, rows} = await channel.cloneTable<Tst>('tst');
      const client = await createVersionedTable<Tst>({
        tableName: 'tst',
        primaryKey: '_id',
        initialData: {
          commitId: lastCommitId,
          data: rows
        }
      });
      const testRecord = tstRecord('TEST1');
      const testRecord2 = tstRecord('TEST2');
      await server.addRecord(testRecord);
      await server.addRecord(testRecord2);
      await pull(client, channel);
      expect(client.lastCommitId()).toBe(server.lastCommitId());
      expect(client.syncTbl!.syncSize()).toBe(2);
      const sRow = await server.tbl.getRecord('TEST1');
      expect(client.syncTbl!.syncGetRecord('TEST1')).toEqual(sRow);
    });

    test('Changes from other client to pull', async () => {
      const pgDb = await getDb();
      const server = await createVersionedTable<Tst>({
        primaryKey: '_id',
        tableName: 'tst',
        dbType: createPgTable({
          tblDef: tstTblDef,
          pgDb: pgDb,
          keyField: '_id'
        }),
        versionHistoryType: await createPgTableVersionHistory({
          pgDb: pgDb,
          historyTblDef: tstLogTblDef,
          who: 'TESTID'
        })
      });
      const channel = createInMemoryVTChannel(server);
      const {lastCommitId, rows} = await channel.cloneTable<Tst>('tst');
      const client1 = await createVersionedTable<Tst>({
        tableName: 'tst',
        primaryKey: '_id',
        initialData: {
          commitId: lastCommitId,
          data: rows
        }
      });
      const client2 = await createVersionedTable<Tst>({
        tableName: 'tst',
        primaryKey: '_id',
        initialData: {
          commitId: lastCommitId,
          data: rows
        }
      });
      const testRecord = tstRecord('TEST1');
      await client1.addRecord(testRecord);
      await push(client1, channel);
      await pull(client2, channel);
      await client2.updateRecord('TEST1', {amount: 998});
      await push(client2, channel);
      await pull(client1, channel);
      expect(client1.syncTbl!.syncSize()).toBe(1);
      expect(client2.syncTbl!.syncSize()).toBe(1);
      expect(client1.syncTbl!.syncGetRecord('TEST1')).toEqual(
        client2.syncTbl!.syncGetRecord('TEST1')
      );
    });

    test('Cancelled merge pull', async () => {
      const pgDb = await getDb();
      const server = await createVersionedTable<Tst>({
        primaryKey: '_id',
        tableName: 'tst',
        dbType: createPgTable({
          tblDef: tstTblDef,
          pgDb: pgDb,
          keyField: '_id'
        }),
        versionHistoryType: await createPgTableVersionHistory({
          pgDb: pgDb,
          historyTblDef: tstLogTblDef,
          who: 'TESTID'
        })
      });
      const channel = createInMemoryVTChannel(server);
      const {lastCommitId, rows} = await channel.cloneTable<Tst>('tst');
      const client1 = await createVersionedTable<Tst>({
        tableName: 'tst',
        primaryKey: '_id',
        initialData: {
          commitId: lastCommitId,
          data: rows
        }
      });
      const client2 = await createVersionedTable<Tst>({
        tableName: 'tst',
        primaryKey: '_id',
        initialData: {
          commitId: lastCommitId,
          data: rows
        }
      });
      const testRecord = tstRecord('TEST1');
      await client1.addRecord(testRecord);
      await push(client1, channel);
      await pull(client2, channel);
      await client2.updateRecord('TEST1', {amount: 998});
      await push(client2, channel);
      await pull(client1, channel, () => true);
      expect(client1.syncTbl!.syncSize()).toBe(1);
      expect(client2.syncTbl!.syncSize()).toBe(1);
      expect(client1.syncTbl!.syncGetRecord('TEST1')!.amount).not.toEqual(
        client2.syncTbl!.syncGetRecord('TEST1')!.amount
      );
    });
  });
});
