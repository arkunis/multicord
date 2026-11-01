import { DatabaseSync } from 'node:sqlite';
import pg from 'pg';
import { postgresOptions } from '../server/db.js';

// L'application doit être arrêtée durant la copie. La source reste en lecture seule.
if (!process.env.DATABASE_URL) throw new Error('DATABASE_URL requis pour la migration PostgreSQL.');
const source = new DatabaseSync(process.env.SQLITE_PATH || 'data/multicord.db', { readOnly: true });
const pool = new pg.Pool(postgresOptions(process.env.DATABASE_URL));
const tables = {
  users: ['id', 'username', 'email', 'password', 'color', 'created_at'],
  servers: ['id', 'name', 'description', 'color', 'owner_id', 'created_at'],
  memberships: ['server_id', 'user_id'],
  channels: ['id', 'server_id', 'name', 'type', 'description'],
  messages: ['id', 'channel_id', 'user_id', 'content', 'created_at'],
  sessions: ['token', 'user_id', 'expires_at'],
  invites: ['code', 'server_id', 'created_at']
};
let client;
try {
  source.exec('BEGIN');
  const rows = Object.fromEntries(Object.keys(tables).map(table => [table, source.prepare(`SELECT * FROM ${table}`).all()]));
  client = await pool.connect();
  await client.query('BEGIN');
  const targetCounts = {};
  for (const table of Object.keys(tables)) targetCounts[table] = Number((await client.query(`SELECT COUNT(*) AS n FROM ${table}`)).rows[0].n);
  const pristine = targetCounts.users === 4 && targetCounts.servers === 1 && targetCounts.channels === 8 && targetCounts.messages === 4 && !targetCounts.sessions && !targetCounts.invites && targetCounts.memberships === 4;
  const onlyDemo = (await client.query("SELECT COUNT(*) AS n FROM users WHERE id IN ('alice','leo','nora','max')")).rows[0].n === '4';
  // Uniquement sur une destination fraîchement initialisée : évite de doubler
  // les exemples, dont les UUID sont générés à chaque initialisation.
  if (pristine && onlyDemo && rows.messages.some(row => row.channel_id === 'general' && ['alice','leo','nora','max'].includes(row.user_id))) {
    await client.query("DELETE FROM messages WHERE channel_id='general' AND user_id IN ('alice','leo','nora','max')");
  }
  for (const [table, columns] of Object.entries(tables)) {
    let inserted = 0;
    const sql = `INSERT INTO ${table} (${columns.join(',')}) VALUES (${columns.map((_,i)=>`$${i+1}`).join(',')}) ON CONFLICT DO NOTHING`;
    for (const row of rows[table]) {
      inserted += (await client.query(sql, columns.map(column => row[column]))).rowCount;
      const keys = table === 'memberships' ? ['server_id','user_id'] : [table === 'sessions' ? 'token' : table === 'invites' ? 'code' : 'id'];
      const check = await client.query(`SELECT 1 FROM ${table} WHERE ${keys.map((key,i)=>`${key}=$${i+1}`).join(' AND ')}`, keys.map(key => row[key]));
      if (!check.rowCount) throw new Error(`Une ligne de ${table} n’a pas pu être transférée.`);
    }
    console.log(`${table}: ${rows[table].length} lignes vérifiées, ${inserted} insérées`);
  }
  await client.query('COMMIT');
  source.exec('COMMIT');
  console.log('Migration validée. La base SQLite source est conservée sans modification.');
} catch (error) {
  if (client) await client.query('ROLLBACK').catch(()=>{});
  console.error(`Migration annulée : ${error.message}`);
  process.exitCode = 1;
} finally {
  source.close();
  client?.release();
  await pool.end();
}
