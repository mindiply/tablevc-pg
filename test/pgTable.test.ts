import { clearTestDb, initTestDb } from "./db/init";
import {createPgTable} from '../src';
import {tstTblDef} from './db/tstTableDef';
import {getDb} from './db/dbProvider';

beforeAll(async () => {
  return initTestDb();
});

afterAll(() => clearTestDb());

describe('Basic table API', () => {
  beforeEach(async () => {
    const pgDb = await getDb();
    return pgDb.none('delete from tst');
  });

  test('Inserting the first record', async () => {
    const pgDb = await getDb();
    const pgTbl = createPgTable({
      tblDef: tstTblDef,
      pgDb: pgDb!,
      keyField: '_id'
    });

    const testRecord1 = {
      _id: 'TEST1',
      name: 'Test n1',
      amount: 10,
      nullable: null,
      when: new Date(2022, 0, 1)
    };
    await pgTbl.tx(async tst => {
      await tst.setRecord(testRecord1);
    });
    const addedRecord = await pgTbl.getRecord('TEST1');
    expect(addedRecord).toEqual(testRecord1);
  });

  test('Inserting and updating a record', async () => {
    const pgDb = await getDb();
    const pgTbl = createPgTable({
      tblDef: tstTblDef,
      pgDb: pgDb!,
      keyField: '_id'
    });

    const testRecord1 = {
      _id: 'TEST1',
      name: 'Test n1',
      amount: 10,
      nullable: null,
      when: new Date(2022, 0, 1)
    };
    await pgTbl.tx(async tst => {
      await tst.setRecord(testRecord1);
    });
    await pgTbl.tx(async tst => {
      const record = await pgTbl.getRecord('TEST1');
      await tst.setRecord({...record, amount: 20});
    });
    const addedRecord = await pgTbl.getRecord('TEST1');
    expect(addedRecord).toEqual({...testRecord1, amount: 20});
  });

  test('Deleting a record', async () => {
    const pgDb = await getDb();
    const pgTbl = createPgTable({
      tblDef: tstTblDef,
      pgDb: pgDb!,
      keyField: '_id'
    });

    const testRecord1 = {
      _id: 'TEST1',
      name: 'Test n1',
      amount: 10,
      nullable: null,
      when: new Date(2022, 0, 1)
    };
    await pgTbl.tx(async tst => {
      await tst.setRecord(testRecord1);
    });
    const addedRecord = await pgTbl.getRecord('TEST1');
    expect(addedRecord).toEqual(testRecord1);
    await pgTbl.tx(async tst => {
      await tst.deleteRecord('TEST1');
    });
    const deletedRecord = await pgTbl.getRecord('TEST1');
    expect(deletedRecord).toBe(undefined);
  });
});
