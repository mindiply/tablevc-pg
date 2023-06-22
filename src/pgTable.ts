import {
  generateNewId,
  Id,
  isBinaryFilter,
  isId,
  isTableFilterExpression,
  KeyFilter,
  Table,
  TableTransactionBody,
  WritableTable,
  FilterExpressionType,
  TableFilterExpression
} from 'tablevc';
import {IBaseProtocol} from 'pg-promise';
import {omit} from 'lodash';
import {
  alias,
  and,
  count,
  createDBTbl,
  diffs,
  equals,
  IDBTable,
  lessOrEqual,
  lessThan,
  list,
  moreOrEqual,
  moreThan,
  not,
  prm,
  ReferencedTable,
  SQLExpression,
  sqlIn,
  tbl,
  usePg,
  value,
  TableFieldUpdates,
  functionCall,
  or
} from 'yaso';
import {objChanges} from './objchanges';
import {PgTablePrms} from './types';
import type {
  BaseFilterExpression,
  EmptyFilterExpression
} from 'tablevc/src/tableFiltersTypes';

usePg();

export class PgTable<RecordType extends Record<any, any>>
  implements Table<RecordType>, WritableTable<RecordType>
{
  private dbTbl: IDBTable<RecordType>;
  private pgDb: IBaseProtocol<any>;
  private readonly keyField: keyof RecordType;
  private readonly qryBaseCond?: SQLExpression;
  private readonly generateMissingId: boolean;

  constructor({
    tblDef,
    keyField,
    pgDb,
    qryBaseCond,
    generateMissingId = true
  }: PgTablePrms<RecordType>) {
    this.dbTbl = createDBTbl(tblDef);
    this.pgDb = pgDb;
    this.keyField = keyField;
    this.qryBaseCond = qryBaseCond;
    this.generateMissingId = generateMissingId;
  }

  public get syncTbl() {
    return null;
  }

  public get primaryKey() {
    return this.keyField;
  }

  public get tableName() {
    return this.dbTbl.dbName;
  }

  public getRecord = async (recordId: Id): Promise<RecordType | undefined> => {
    const getRecordSql = this.sqlGetRecord();
    const record = await this.pgDb.task(db =>
      db.oneOrNone(getRecordSql, {recordId})
    );
    return record || undefined;
  };

  private sqlGetRecord = (): string => {
    const sql = tbl(this.dbTbl).selectQrySql(sTbl => ({
      where: this.qryBaseCond
        ? and([
            this.qryBaseCond,
            equals(sTbl.fields.get(this.keyField)!, prm('recordId'))
          ])
        : equals(sTbl.fields.get(this.keyField)!, prm('recordId'))
    }));
    return sql;
  };

  public getRecords = async <
    Ext extends BaseFilterExpression = EmptyFilterExpression
  >(
    keys?: Id[] | KeyFilter<RecordType> | TableFilterExpression<RecordType, Ext>
  ) => {
    if (keys && Array.isArray(keys)) {
      const sql = tbl(this.dbTbl).selectQrySql(sTbl => ({
        where: sqlIn(sTbl.fields.get(this.keyField)!, list(keys))
      }));
      return this.pgDb.task<RecordType[]>(db => db.any(sql));
    } else if (keys && isTableFilterExpression(keys)) {
      const sql = tbl(this.dbTbl).selectQrySql(sTbl => ({
        where: tableFilterToSqlWhere(sTbl, keys)
      }));
      return this.pgDb.task<RecordType[]>(db => db.any(sql));
    } else {
      const records = await this.allRecords(false);
      return keys && typeof keys === 'function'
        ? records.filter(record => keys(record))
        : records;
    }
  };

  public allKeys = async <
    Ext extends BaseFilterExpression = EmptyFilterExpression
  >(
    filter?: KeyFilter<RecordType> | TableFilterExpression<RecordType, Ext>
  ): Promise<Id[]> => {
    if (filter && isTableFilterExpression(filter)) {
      const sql = tbl(this.dbTbl).selectQrySql(sTbl => ({
        fields: [sTbl.fields.get(this.keyField)!],
        where: tableFilterToSqlWhere(sTbl, filter)
      }));
      const keyRecords = await this.pgDb.task<RecordType[]>(db => db.any(sql));
      return keyRecords.map(
        keyRecord => keyRecord[this.primaryKey] as unknown as Id
      );
    }
    const keyRecords = await this.allRecords(true);
    if (filter && isTableFilterExpression(filter)) {
      return [];
    }
    return (
      filter ? keyRecords.filter(filter as KeyFilter<RecordType>) : keyRecords
    ).map(keyRecord => keyRecord[this.keyField] as unknown as Id);
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
    if (res) {
      if (typeof res.nRecords === 'string') {
        let nRecords = 0;
        try {
          nRecords = parseInt(res.nRecords);
        } catch (err) {
          // do nothing
        }
        return nRecords;
      }
    }
    return 0;
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

  public setRecord = async (
    keyId: Id | Partial<RecordType>,
    inpRecord?: RecordType
  ) => {
    if (isId(keyId) && !inpRecord) {
      throw new Error('If setting the recordId, you need a record as well');
    }
    const record = isId(keyId) ? inpRecord! : keyId;
    return this.pgDb.tx(async db => {
      let existingRecord: null | RecordType = null;
      const existingRecordId = isId(keyId)
        ? keyId
        : this.keyField in record
        ? (record[this.keyField] as unknown as Id)
        : null;
      if (existingRecordId) {
        existingRecord = (await this.getRecord(existingRecordId)) || null;
      }
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
        await db.none(sql, {...changes, recordId: existingRecordId});
        return db.one(this.sqlGetRecord(), {
          recordId: existingRecordId
        });
      } else {
        let recordToAdd = record as unknown as RecordType;
        if (!(this.primaryKey in recordToAdd) && this.generateMissingId) {
          recordToAdd = {...recordToAdd, [this.primaryKey]: generateNewId()};
        }
        const toInsertRecord = omit(recordToAdd, fieldsToOmit);

        const sql = tbl(this.dbTbl).insertQrySql({
          returnFields: true,
          // @ts-expect-error typing issue with records
          fields: createPrmsMap(toInsertRecord)
        });
        const addedRecord: RecordType = await db.one(sql, toInsertRecord);
        return db.one(this.sqlGetRecord(), {
          recordId: addedRecord[this.primaryKey]
        });
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

function createPrmsMap<RecordType extends Record<any, any>>(
  changes: RecordType
): MappedPrms<RecordType> {
  const outPrms: Partial<MappedPrms<RecordType>> = {};
  for (const key in changes) {
    outPrms[key] = prm(key);
  }
  return outPrms as MappedPrms<RecordType>;
}

export const createPgTable = <RecordType extends Record<any, any>>(
  prms: PgTablePrms<RecordType>
): Table<RecordType> => {
  return new PgTable(prms);
};

function tableFilterToSqlWhere<RecordType>(
  tableRef: ReferencedTable<RecordType>,
  tableFilter: TableFilterExpression<RecordType>
): SQLExpression {
  if (
    tableFilter.__typename === FilterExpressionType.or ||
    tableFilter.__typename === FilterExpressionType.and
  ) {
    const {expressions} = tableFilter;
    const filters = expressions.map(expression =>
      tableFilterToSqlWhere(tableRef, expression)
    );
    return tableFilter.__typename === FilterExpressionType.and
      ? and(filters)
      : or(filters);
  } else if (tableFilter.__typename === FilterExpressionType.fieldReference) {
    return tableRef.fields.get(tableFilter.fieldReference)!;
  } else if (isBinaryFilter(tableFilter)) {
    const {left, right} = tableFilter;
    const operator =
      tableFilter.__typename === FilterExpressionType.equals
        ? equals
        : tableFilter.__typename === FilterExpressionType.lessThan
        ? lessThan
        : tableFilter.__typename === FilterExpressionType.notEquals
        ? diffs
        : tableFilter.__typename === FilterExpressionType.lessEquals
        ? lessOrEqual
        : tableFilter.__typename === FilterExpressionType.moreThan
        ? moreThan
        : tableFilter.__typename === FilterExpressionType.moreEquals
        ? moreOrEqual
        : equals;
    return operator(
      tableFilterToSqlWhere(tableRef, left),
      tableFilterToSqlWhere(tableRef, right)
    );
  } else if (tableFilter.__typename === FilterExpressionType.not) {
    return not(tableFilterToSqlWhere(tableRef, tableFilter.expression));
  } else if (tableFilter.__typename === FilterExpressionType.scalar) {
    return value(tableFilter.value);
  } else if (tableFilter.__typename === FilterExpressionType.quotedString) {
    return value(tableFilter.text);
  } else if (tableFilter.__typename === FilterExpressionType.functionCall) {
    return functionCall(
      tableFilter.functionName,
      tableFilter.parameters.map(prmFilter =>
        tableFilterToSqlWhere(tableRef, prmFilter)
      )
    );
  }
  throw new Error('Unrecognized filter');
}
