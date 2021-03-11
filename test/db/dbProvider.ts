import pgpromise, {IDatabase} from 'pg-promise';

const pgp = pgpromise({
  // query: e => {
  //   // eslint-disable-next-line no-console
  //   console.log(e.query); // print all of the queries being executed;
  // }
});
let _db: IDatabase<any>;

export async function getDb() {
  if (!_db) {
    // console.log(
    //   `Connecting to host ${process.env.PGUSERSHOST} to db ${process.env.PGUSERSDATABASE} with user ${process.env.PGUSERSUSER} for schema mindiplyusers`
    // );
    _db = pgp({
      database: process.env.TEST_PG_DB || 'tablevc_test',
      host: process.env.TEST_PG_HOST || 'localhost',
      password: process.env.TEST_PG_PASSWORD || 'password',
      port: 5432,
      user: process.env.TEST_PG_USER || 'postgres'
    });
  }
  return _db;
}
