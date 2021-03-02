import {KeyFilter, Table, TableTransactionBody, WritableTable} from 'tablevc'
import {IBaseProtocol} from 'pg-promise'
import {omit} from 'lodash'
import {alias, and, count, createDBTbl, equals, Id, IDBTable, list, prm, SQLExpression, sqlIn, tbl, value} from 'yaso'
import {objChanges} from './objChanges'
import {TableFieldUpdates} from 'yaso/lib/query/types'
import {PgTablePrms} from './types'

export class PgTable<RecordType>
  implements Table<RecordType>, WritableTable<RecordType> {
  private dbTbl: IDBTable<RecordType>;
  private pgDb: IBaseProtocol<any>;
  private keyField: keyof RecordType;
  private qryBaseCond?: SQLExpression;

  constructor({tblDef, keyField, pgDb, qryBaseCond}: PgTablePrms<RecordType>) {
    this.dbTbl = createDBTbl(tblDef);
    this.pgDb = pgDb;
    this.keyField = keyField;
    this.qryBaseCond = qryBaseCond;
  }

  public get syncTbl() {
    return null;
  }

  public getRecord = async (recordId: Id): Promise<RecordType | undefined> => {
    const getRecordSql = tbl(this.dbTbl).selectQrySql(sTbl => ({
      where: this.qryBaseCond
        ? and([
            this.qryBaseCond,
            equals(sTbl.fields.get(this.keyField)!, prm('recordId'))
          ])
        : equals(sTbl.fields.get(this.keyField)!, prm('recordId'))
    }));
    const record = await this.pgDb.task(db =>
      db.oneOrNone(getRecordSql, {recordId})
    );
    return record || undefined;
  };

  public getRecords = async (keys?: Id[] | KeyFilter<RecordType>) => {
    let sql: string;
    if (keys && Array.isArray(keys)) {
      sql = tbl(this.dbTbl).selectQrySql(sTbl => ({
        where: sqlIn(sTbl.fields.get(this.keyField)!, list(keys))
      }));
      return this.pgDb.task<RecordType[]>(db => db.any(sql));
    } else {
      const records = await this.allRecords(false);
      return keys && typeof keys === 'function'
        ? records.filter(record => keys(record))
        : records;
    }
  };

  public allKeys = async (filter?: KeyFilter<RecordType>): Promise<Id[]> => {
    const keyRecords = await this.allRecords(true);
    return (filter ? keyRecords.filter(filter) : keyRecords).map(
      keyRecord => (keyRecord[this.keyField] as unknown) as Id
    );
  };

  public hasRecord = async (recordId: Id) => {
    const getRecordSql = tbl(this.dbTbl).selectQrySql(sTbl => ({
      fields: [value(1)],
      where: this.qryBaseCond
        ? and([
            this.qryBaseCond,
            equals(sTbl.fields.get(this.keyField)!, prm('recordId'))
          ])
        : equals(sTbl.fields.get(this.keyField)!, prm('recordId'))
    }));
    const record = await this.pgDb.task(db =>
      db.oneOrNone(getRecordSql, {recordId})
    );
    return Boolean(record);
  };

  public size = async () => {
    const sql = tbl(this.dbTbl).selectQrySql({
      fields: [alias(count(value(1)), 'nRecords')],
      ...(this.qryBaseCond ? {where: this.qryBaseCond} : {})
    });
    const res = await this.pgDb.task<{nRecords: number}>(db =>
      db.oneOrNone(sql)
    );
    return res ? res.nRecords : 0;
  };

  public tx = <ReturnType = any>(
    txBody: TableTransactionBody<RecordType, ReturnType>
  ): Promise<ReturnType> => {
    return this.pgDb.tx<ReturnType>(() => txBody(this));
  };

  public deleteRecord = async (recordId: Id) => {
    const sql = tbl(this.dbTbl).deleteQrySql(rTbl => ({
      where: equals(rTbl.fields.get(this.keyField)!, prm('recordId'))
    }));
    await this.pgDb.tx(db => db.none(sql, {recordId}));
  };

  public setRecord = async (recordId: Id, record: RecordType) => {
    return this.pgDb.tx(async db => {
      const existingRecord = await this.getRecord(recordId);
      const fieldsToOmit: Array<keyof RecordType> = [];
      if (this.dbTbl.ccField) {
        fieldsToOmit.push(this.dbTbl.ccField.name);
      }
      if (this.dbTbl.insertTimestampField) {
        fieldsToOmit.push(this.dbTbl.insertTimestampField.name);
      }
      if (this.dbTbl.updateTimestampField) {
        fieldsToOmit.push(this.dbTbl.updateTimestampField.name);
      }
      if (existingRecord) {
        const changes = omit(objChanges(existingRecord, record), fieldsToOmit);
        if (Object.keys(changes).length === 0) {
          return;
        }
        const sql = tbl(this.dbTbl).updateQrySql(rTbl => ({
          fields: createPrmsMap(changes) as TableFieldUpdates<RecordType>,
          where: this.qryBaseCond
            ? and([
                this.qryBaseCond,
                equals(rTbl.fields.get(this.keyField)!, prm('recordId'))
              ])
            : equals(rTbl.fields.get(this.keyField)!, prm('recordId'))
        }));
        await db.none(sql, {...changes, recordId});
      } else {
        // @ts-expect-error RecordType does not extend object by default
        const toInsertRecord = omit(record, fieldsToOmit);
        const sql = tbl(this.dbTbl).insertQrySql({
          fields: createPrmsMap(toInsertRecord)
        });
        await db.none(sql, toInsertRecord);
      }
    });
  };

  private allRecords = async (idOnly: boolean): Promise<RecordType[]> => {
    const sql = tbl(this.dbTbl).selectQrySql(sTbl => ({
      ...(idOnly ? {fields: [sTbl.fields.get(this.keyField)!]} : {}),
      ...(this.qryBaseCond ? {where: this.qryBaseCond} : {})
    }));
    return this.pgDb.task<RecordType[]>(db => db.any(sql));
  };
}

type MappedPrms<RecordType> = {
  [K in keyof RecordType]: SQLExpression;
};

function createPrmsMap<RecordType>(
  changes: RecordType
): MappedPrms<RecordType> {
  const outPrms: Partial<MappedPrms<RecordType>> = {};
  for (const key in changes) {
    outPrms[key] = prm(key);
  }
  return outPrms as MappedPrms<RecordType>;
}

export const createPgTable = <RecordType>(
  prms: PgTablePrms<RecordType>
): Table<RecordType> => {
  return new PgTable(prms);
};
