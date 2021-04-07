import {clearTestDb, initTestDb} from './db/init';
import {createPgTable} from '../src';
import {Tst, tstTblDef} from './db/tstTableDef';
import {getDb} from './db/dbProvider';
import {
  and,
  equals,
  fieldReference,
  functionCall,
  lessEquals,
  lessThan,
  moreThan,
  not,
  or,
  scalarValue
} from 'tablevc';

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

  test('Inserting the first record without providing an id', async () => {
    const pgDb = await getDb();
    const pgTbl = createPgTable({
      tblDef: tstTblDef,
      pgDb: pgDb!,
      keyField: '_id'
    });

    const testRecord1 = {
      name: 'Test n1',
      amount: 10,
      nullable: null,
      when: new Date(2022, 0, 1)
    };
    const newId = (
      await pgTbl.tx(async tst => {
        return tst.setRecord(testRecord1);
      })
    )._id;
    const addedRecord = await pgTbl.getRecord(newId);
    expect(addedRecord).toEqual({...testRecord1, _id: newId});
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

let idCounter = 0;

const testRecord = (fields: Partial<Tst>): Tst => ({
  _id: `TEST_AUTO_${idCounter++}`,
  name: `Test n${idCounter}`,
  amount: idCounter,
  nullable: null,
  when: new Date(2022, 0, (idCounter % 31) + 1),
  ...fields
});

describe('Querying data', () => {
  beforeEach(async () => {
    const pgDbt = await getDb();
    await pgDbt.tx(pgDb => pgDb.none('delete from tst'));
    const pgTbl = createPgTable({
      tblDef: tstTblDef,
      pgDb: pgDbt!,
      keyField: '_id'
    });
    await pgTbl.tx(async tst => {
      const testRecord1 = testRecord({
        _id: 'TEST1',
        amount: -1
      });
      const testRecord2 = testRecord({
        _id: 'TEST2'
      });
      const testRecord3 = testRecord({
        _id: 'TEST3'
      });
      const testRecord4 = testRecord({
        _id: 'TEST4'
      });
      const testRecord5 = testRecord({
        _id: 'TEST5'
      });
      await tst.setRecord(testRecord1);
      await tst.setRecord(testRecord2);
      await tst.setRecord(testRecord3);
      await tst.setRecord(testRecord4);
      await tst.setRecord(testRecord5);
    });
  });

  test('Returning no keys', async () => {
    const pgDb = await getDb();
    const pgTbl = createPgTable({
      tblDef: tstTblDef,
      pgDb: pgDb!,
      keyField: '_id'
    });
    const records = await pgTbl.allKeys(
      moreThan(fieldReference('_id'), scalarValue('TEST5'))
    );
    expect(records.length).toBe(0);
  });

  test('Returning no records', async () => {
    const pgDb = await getDb();
    const pgTbl = createPgTable({
      tblDef: tstTblDef,
      pgDb: pgDb!,
      keyField: '_id'
    });
    const records = await pgTbl.getRecords(
      moreThan(fieldReference('_id'), scalarValue('TEST5'))
    );
    expect(records.length).toBe(0);
  });

  test('Returning all keys', async () => {
    const pgDb = await getDb();
    const pgTbl = createPgTable({
      tblDef: tstTblDef,
      pgDb: pgDb!,
      keyField: '_id'
    });
    const records = await pgTbl.allKeys(
      lessEquals(fieldReference('_id'), scalarValue('TEST5'))
    );
    expect(records.length).toBe(5);
  });

  test('Returning all records', async () => {
    const pgDb = await getDb();
    const pgTbl = createPgTable({
      tblDef: tstTblDef,
      pgDb: pgDb!,
      keyField: '_id'
    });
    const records = await pgTbl.getRecords(
      not(moreThan(fieldReference('_id'), scalarValue('TEST5')))
    );
    expect(records.length).toBe(5);
  });

  test('Returning 2 records with or', async () => {
    const pgDb = await getDb();
    const pgTbl = createPgTable({
      tblDef: tstTblDef,
      pgDb: pgDb!,
      keyField: '_id'
    });
    const records = await pgTbl.getRecords(
      or(
        equals(fieldReference('_id'), scalarValue('TEST5')),
        equals(fieldReference('_id'), scalarValue('TEST3'))
      )
    );
    expect(records.length).toBe(2);
  });

  test('Returning 2 records with and', async () => {
    const pgDb = await getDb();
    const pgTbl = createPgTable({
      tblDef: tstTblDef,
      pgDb: pgDb!,
      keyField: '_id'
    });
    const records = await pgTbl.getRecords(
      and(
        or(
          equals(fieldReference('_id'), scalarValue('TEST5')),
          equals(fieldReference('_id'), scalarValue('TEST3')),
          equals(fieldReference('_id'), scalarValue('TEST1'))
        ),
        moreThan(fieldReference('amount'), scalarValue(0))
      )
    );
    expect(records.length).toBe(2);
  });

  test('Returning 2 records with functionCall', async () => {
    const pgDb = await getDb();
    const pgTbl = createPgTable({
      tblDef: tstTblDef,
      pgDb: pgDb!,
      keyField: '_id'
    });
    const records = await pgTbl.getRecords(
      or(
        equals(
          functionCall('lower', [fieldReference('_id')]),
          scalarValue('test5')
        ),
        equals(
          functionCall('lower', [fieldReference('_id')]),
          scalarValue('test4')
        )
      )
    );
    expect(records.length).toBe(2);
  });
});
