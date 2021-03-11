import {getDb} from './dbProvider';

export async function initTestDb() {
  const dbt = await getDb();
  return dbt.tx(async db => {
    await db.none('drop table if exists tst_log');
    await db.none('drop table if exists tst');
    await db.none(`
create table tst (
  tst_id text primary key,
  tst_name text not null,
  tst_amount int not null,
  tst_when timestamp not null,
  tst_nullable text
)`);
    await db.none(`
create table tst_log (
  tst_log_id serial primary key,
  tst_log_history_entry jsonb not null,
  tst_log_commit_id text not null,
  tst_log_created_at timestamp not null
)`);
  });
}

export async function clearTestDb() {
  const dbt = await getDb();
  await dbt.tx(async db => {
    await db.none('drop table if exists tst_log');
    await db.none('drop table if exists tst');
  });
  return dbt.$pool.end();
}
