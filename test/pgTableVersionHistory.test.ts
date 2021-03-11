import {clearTestDb, initTestDb} from './db/init';
import {createInMemoryVTChannel, createVersionedTable, Id, push} from 'tablevc';
import {Tst, tstLogTblDef, tstTblDef} from './db/tstTableDef';
import {getDb} from './db/dbProvider';
import {createPgTable, createPgTableVersionHistory} from '../src';

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

describe('Dealing with multiple clients', () => {
  beforeEach(async () => {
    const pgDb = await getDb();
    await pgDb.none('delete from tst_log');
    return pgDb.none('delete from tst');
  });

  test('Clients updating separate records', async () => {
    const pgDb = await getDb();
    const testRecord1 = tstRecord('TEST1');
    const testRecord2 = tstRecord('TEST2');
    const testRecord3 = tstRecord('TEST3');
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
    await server.addRecord(testRecord1);
    await server.addRecord(testRecord2);
    await server.addRecord(testRecord3);
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
    await client2.updateRecord('TEST2', {nullable: 'Not null anymore'});
    await push(client2, channel);
    const tableHistory = await createPgTableVersionHistory({
      historyTblDef: tstLogTblDef,
      fromCommitId: client1.lastRemoteCommitId!,
      pgDb
    });
    const delta = tableHistory.getHistoryDelta(client1.lastRemoteCommitId!);
    expect(delta).not.toBe(null);
    expect(delta!.changes.length).toBe(1);
    expect(delta!.changes[0]).toMatchObject({
      changes: {nullable: 'Not null anymore'}
    });
  });
});
