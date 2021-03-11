import {
  createPgTable,
  createPgTableVersionHistory,
  loadVersionedTableData
} from '../src';
import {clearTestDb, initTestDb} from './db/init';
import {createVersionedTable, Id, HistoryOperationType} from 'tablevc';
import {Tst, tstLogTblDef, tstTblDef} from './db/tstTableDef';
import {getDb} from './db/dbProvider';

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

describe('Loading data from the db', () => {
  test('3 records and logs', async () => {
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
    const {
      data: records,
      lastHistoryEntry: logRecord
    } = await loadVersionedTableData({
      pgDb,
      recordTableDef: tstTblDef,
      keyField: '_id',
      logTableDef: tstLogTblDef
    });
    expect(records.length).toBe(3);
    records.sort((a, b) => (a.name < b.name ? -1 : a.name === b.name ? 0 : 1));
    expect(records[0]).toEqual(testRecord1);
    expect(records[1]).toEqual(testRecord2);
    expect(records[2]).toEqual(testRecord3);
    expect(logRecord!.__typename).toBe(
      HistoryOperationType.TABLE_RECORD_CHANGE
    );
    expect(logRecord!.when instanceof Date).toBe(true);
  });
});
