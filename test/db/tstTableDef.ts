import { createDBTbl, TableDefinition } from "yaso";
import { TableHistoryTable } from "../../lib";

export interface Tst {
  _id: string;
  name: string;
  amount: number;
  when: Date;
  nullable: string | null;
}

export const tstTblDef: TableDefinition<Tst> = {
  dbName: 'tst',
  name: 'tst',
  fields: [
    {
      dbName: 'tst_id',
      name: '_id'
    },
    {
      dbName: 'tst_amount',
      name: 'amount'
    },
    {
      dbName: 'tst_name',
      name: 'name'
    },
    {
      dbName: 'tst_when',
      name: 'when'
    },
    {
      dbName: 'tst_nullable',
      name: 'nullable'
    }
  ]
};

export const tstLogTblDef: TableDefinition<TableHistoryTable<Tst>> = {
  name: 'tstLog',
  dbName: 'tst_log',
  fields: [
    {
      name: '_id',
      dbName: 'tst_log_id'
    },
    {
      name: 'historyEntry',
      dbName: 'tst_log_history_entry'
    },
    {
      name: 'createdAt',
      dbName: 'tst_log_created_at'
    },
    {
      name: 'commitId',
      dbName: 'tst_log_commit_id'
    }
  ]
};
