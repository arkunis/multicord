import { mkdirSync, readFileSync } from 'node:fs';
import { DatabaseSync } from 'node:sqlite';
import pg from 'pg';
import {dirname,resolve} from 'node:path';

export function postgresOptions(url, env = process.env) {
  const options = { connectionString: url, max: 5, connectionTimeoutMillis: 10000, idleTimeoutMillis: 30000 };
  const max = Number(env.DATABASE_POOL_MAX || 5);
  if (!Number.isInteger(max) || max < 1 || max > 10) throw new Error('DATABASE_POOL_MAX doit être un entier entre 1 et 10.');
  options.max = max;
  if (env.DATABASE_SSL_CA_FILE) {
    const parsed = new URL(url);
    // pg remplace l'objet ssl quand ces paramètres figurent dans l'URL.
    // La présence d'une CA explicite impose une validation complète TLS.
    for (const key of ['sslmode', 'sslrootcert', 'sslcert', 'sslkey', 'ssl', 'uselibpqcompat']) parsed.searchParams.delete(key);
    options.connectionString = parsed.toString();
    options.ssl = { ca: readFileSync(env.DATABASE_SSL_CA_FILE, 'utf8'), rejectUnauthorized: true };
  }
  return options;
}

export async function openDatabase(url = process.env.DATABASE_URL, path = process.env.SQLITE_PATH || 'data/multicord.db') {
  let db;
  if (url) {
    const pool = new pg.Pool(postgresOptions(url));
    pool.on('error', () => console.error('Une connexion PostgreSQL inactive a été interrompue.'));
    const adapter = target => ({ all: async (sql, args = []) => (await target.query(sql, args)).rows,
      run: async (sql, args = []) => target.query(sql, args) });
    db = { ...adapter(pool), close: () => pool.end(), transaction: async fn => {
      const client = await pool.connect();
      try { await client.query('BEGIN'); const result = await fn(withOne(adapter(client))); await client.query('COMMIT'); return result; }
      catch (error) { await client.query('ROLLBACK'); throw error; }
      finally { client.release(); }
    } };
  } else {
    if(path!==':memory:')mkdirSync(dirname(resolve(path)), { recursive: true });
    const sqlite = new DatabaseSync(path);
    sqlite.exec('PRAGMA foreign_keys=ON; PRAGMA journal_mode=WAL;');
    const prepare = (sql, args) => {
      const values = [];
      const translated = sql.replace(/\$(\d+)/g, (_, n) => { values.push(args[Number(n) - 1]); return '?'; });
      return [sqlite.prepare(translated), values];
    };
    const raw = withOne({ all: async (sql, args = []) => { const [s, v] = prepare(sql, args); return s.all(...v); },
      run: async (sql, args = []) => { const [s, v] = prepare(sql, args); return s.run(...v); } });
    let tail = Promise.resolve();
    const enqueue = fn => { const result = tail.then(fn); tail = result.catch(()=>{}); return result; };
    db = { all: (...args) => enqueue(()=>raw.all(...args)), run: (...args) => enqueue(()=>raw.run(...args)), close: () => sqlite.close(),
      transaction: fn => enqueue(async()=>{ sqlite.exec('BEGIN IMMEDIATE'); try { const result=await fn(raw);sqlite.exec('COMMIT');return result; } catch(error){sqlite.exec('ROLLBACK');throw error;} }) };
  }
  withOne(db);
  for (const sql of schema) await db.run(sql);
  await db.transaction(async tx=>{
    const added=await tx.one('INSERT INTO app_migrations (id,applied_at) VALUES ($1,$2) ON CONFLICT DO NOTHING RETURNING id',['profile-avatar-v1',new Date().toISOString()]);
    if(added)await tx.run('ALTER TABLE users ADD COLUMN avatar TEXT');
  });
  // Catégories de salons : les serveurs existants reçoivent les deux groupes affichés jusqu'ici.
  await db.transaction(async tx=>{
    const added=await tx.one('INSERT INTO app_migrations (id,applied_at) VALUES ($1,$2) ON CONFLICT DO NOTHING RETURNING id',['channel-categories-v1',new Date().toISOString()]);
    if(!added)return;
    await tx.run('ALTER TABLE channels ADD COLUMN category_id TEXT');
    await tx.run('ALTER TABLE channels ADD COLUMN position INTEGER NOT NULL DEFAULT 0');
    for(const s of await tx.all('SELECT id FROM servers'))for(const [index,[name,type]]of [['Le coin discussion','text'],['On se retrouve','voice']].entries()){
      const id=crypto.randomUUID();await tx.run('INSERT INTO channel_categories (id,server_id,name,position) VALUES ($1,$2,$3,$4)',[id,s.id,name,index]);
      const channels=await tx.all('SELECT id FROM channels WHERE server_id=$1 AND type=$2 ORDER BY name',[s.id,type]);
      for(const [position,c]of channels.entries())await tx.run('UPDATE channels SET category_id=$1,position=$2 WHERE id=$3',[id,position,c.id]);
    }
  });
  // Rôles affichés à part et mentionnables, pronoms, bio par serveur, expiration du statut.
  await db.transaction(async tx=>{
    const added=await tx.one('INSERT INTO app_migrations (id,applied_at) VALUES ($1,$2) ON CONFLICT DO NOTHING RETURNING id',['profiles-roles-v2',new Date().toISOString()]);
    if(!added)return;
    for(const sql of ['ALTER TABLE server_roles ADD COLUMN hoist INTEGER NOT NULL DEFAULT 0','ALTER TABLE server_roles ADD COLUMN mentionable INTEGER NOT NULL DEFAULT 0',"ALTER TABLE user_profiles ADD COLUMN pronouns TEXT NOT NULL DEFAULT ''",'ALTER TABLE user_profiles ADD COLUMN status_expires TEXT',"ALTER TABLE server_member_profiles ADD COLUMN bio TEXT NOT NULL DEFAULT ''","ALTER TABLE server_member_profiles ADD COLUMN pronouns TEXT NOT NULL DEFAULT ''"])await tx.run(sql);
  });
  return db;
}
function withOne(db) { db.one = async (sql,args)=>(await db.all(sql,args))[0];return db; }

const schema = [
  `CREATE TABLE IF NOT EXISTS users (id TEXT PRIMARY KEY, username TEXT NOT NULL, email TEXT UNIQUE, password TEXT, color TEXT NOT NULL, created_at TEXT NOT NULL)`,
  `CREATE TABLE IF NOT EXISTS sessions (token TEXT PRIMARY KEY, user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE, expires_at TEXT NOT NULL)`,
  `CREATE TABLE IF NOT EXISTS servers (id TEXT PRIMARY KEY, name TEXT NOT NULL, description TEXT NOT NULL, color TEXT NOT NULL, owner_id TEXT REFERENCES users(id), created_at TEXT NOT NULL)`,
  `CREATE TABLE IF NOT EXISTS memberships (server_id TEXT NOT NULL REFERENCES servers(id) ON DELETE CASCADE, user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE, PRIMARY KEY (server_id,user_id))`,
  `CREATE TABLE IF NOT EXISTS channels (id TEXT PRIMARY KEY, server_id TEXT NOT NULL REFERENCES servers(id) ON DELETE CASCADE, name TEXT NOT NULL, type TEXT NOT NULL CHECK(type IN ('text','voice')), description TEXT NOT NULL DEFAULT '')`,
  `CREATE TABLE IF NOT EXISTS messages (id TEXT PRIMARY KEY, channel_id TEXT NOT NULL REFERENCES channels(id) ON DELETE CASCADE, user_id TEXT NOT NULL REFERENCES users(id), content TEXT NOT NULL, created_at TEXT NOT NULL)`,
  `CREATE INDEX IF NOT EXISTS messages_channel_date ON messages(channel_id,created_at)`,
  `CREATE TABLE IF NOT EXISTS invites (code TEXT PRIMARY KEY, server_id TEXT NOT NULL REFERENCES servers(id) ON DELETE CASCADE, created_at TEXT NOT NULL)`,
  `CREATE TABLE IF NOT EXISTS password_resets (token TEXT PRIMARY KEY, user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE, expires_at TEXT NOT NULL)`,
  `CREATE TABLE IF NOT EXISTS app_migrations (id TEXT PRIMARY KEY, applied_at TEXT NOT NULL)`
  ,`CREATE TABLE IF NOT EXISTS user_handles (user_id TEXT PRIMARY KEY REFERENCES users(id) ON DELETE CASCADE, discriminator TEXT NOT NULL UNIQUE CHECK(length(discriminator)=4))`
  ,`CREATE TABLE IF NOT EXISTS friendships (user_a TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE, user_b TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE, requester_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE, status TEXT NOT NULL CHECK(status IN ('pending','accepted')), created_at TEXT NOT NULL, PRIMARY KEY(user_a,user_b), CHECK(user_a<user_b), CHECK(requester_id=user_a OR requester_id=user_b))`
  ,`CREATE TABLE IF NOT EXISTS user_blocks (blocker_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE, blocked_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE, PRIMARY KEY(blocker_id,blocked_id), CHECK(blocker_id<>blocked_id))`
  ,`CREATE TABLE IF NOT EXISTS direct_conversations (id TEXT PRIMARY KEY, user_a TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE, user_b TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE, created_at TEXT NOT NULL, read_a INTEGER NOT NULL DEFAULT 0, read_b INTEGER NOT NULL DEFAULT 0, UNIQUE(user_a,user_b), CHECK(user_a<user_b))`
  ,`CREATE TABLE IF NOT EXISTS direct_messages (id TEXT PRIMARY KEY, conversation_id TEXT NOT NULL REFERENCES direct_conversations(id) ON DELETE CASCADE, sender_id TEXT NOT NULL REFERENCES users(id), content TEXT NOT NULL, created_at TEXT NOT NULL, position INTEGER NOT NULL, UNIQUE(conversation_id,position))`
  ,`CREATE INDEX IF NOT EXISTS direct_messages_history ON direct_messages(conversation_id,position)`
  ,`CREATE TABLE IF NOT EXISTS user_settings (user_id TEXT PRIMARY KEY REFERENCES users(id) ON DELETE CASCADE,data TEXT NOT NULL,updated_at TEXT NOT NULL)`
  ,`CREATE TABLE IF NOT EXISTS session_details (id TEXT PRIMARY KEY,token TEXT NOT NULL UNIQUE REFERENCES sessions(token) ON DELETE CASCADE,user_agent TEXT NOT NULL,created_at TEXT NOT NULL,last_seen TEXT NOT NULL)`
  ,`CREATE TABLE IF NOT EXISTS user_avatars (user_id TEXT PRIMARY KEY REFERENCES users(id) ON DELETE CASCADE,version TEXT NOT NULL,data TEXT NOT NULL)`
  ,`CREATE TABLE IF NOT EXISTS server_profiles (server_id TEXT PRIMARY KEY REFERENCES servers(id) ON DELETE CASCADE,icon TEXT,banner TEXT)`
  ,`CREATE TABLE IF NOT EXISTS server_assets (server_id TEXT NOT NULL REFERENCES servers(id) ON DELETE CASCADE,kind TEXT NOT NULL,version TEXT NOT NULL,data TEXT NOT NULL,PRIMARY KEY(server_id,kind))`
  ,`CREATE TABLE IF NOT EXISTS server_roles (id TEXT PRIMARY KEY,server_id TEXT NOT NULL REFERENCES servers(id) ON DELETE CASCADE,name TEXT NOT NULL,color TEXT NOT NULL,permissions TEXT NOT NULL,is_default INTEGER NOT NULL DEFAULT 0,position INTEGER NOT NULL,UNIQUE(server_id,id))`
  ,`CREATE TABLE IF NOT EXISTS message_pins (message_id TEXT PRIMARY KEY REFERENCES messages(id) ON DELETE CASCADE,channel_id TEXT NOT NULL REFERENCES channels(id) ON DELETE CASCADE,pinned_by TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,pinned_at TEXT NOT NULL)`
  ,`CREATE INDEX IF NOT EXISTS message_pins_channel ON message_pins(channel_id,pinned_at)`
  ,`CREATE TABLE IF NOT EXISTS server_bans (server_id TEXT NOT NULL REFERENCES servers(id) ON DELETE CASCADE,user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,banned_by TEXT REFERENCES users(id) ON DELETE SET NULL,created_at TEXT NOT NULL,PRIMARY KEY(server_id,user_id))`
  ,`CREATE TABLE IF NOT EXISTS server_member_profiles (server_id TEXT NOT NULL,user_id TEXT NOT NULL,nickname TEXT,voice_muted INTEGER NOT NULL DEFAULT 0,PRIMARY KEY(server_id,user_id),FOREIGN KEY(server_id,user_id) REFERENCES memberships(server_id,user_id) ON DELETE CASCADE)`
  ,`CREATE TABLE IF NOT EXISTS user_profiles (user_id TEXT PRIMARY KEY REFERENCES users(id) ON DELETE CASCADE,bio TEXT NOT NULL DEFAULT '',status TEXT NOT NULL DEFAULT '',banner_color TEXT)`
  ,`CREATE TABLE IF NOT EXISTS attachments (id TEXT PRIMARY KEY,uploader_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,channel_id TEXT REFERENCES channels(id) ON DELETE CASCADE,conversation_id TEXT REFERENCES direct_conversations(id) ON DELETE CASCADE,message_id TEXT REFERENCES messages(id) ON DELETE CASCADE,direct_message_id TEXT REFERENCES direct_messages(id) ON DELETE CASCADE,name TEXT NOT NULL,mime TEXT NOT NULL,size INTEGER NOT NULL,data TEXT NOT NULL,created_at TEXT NOT NULL)`
  ,`CREATE INDEX IF NOT EXISTS attachments_message ON attachments(message_id)`
  ,`CREATE INDEX IF NOT EXISTS attachments_direct_message ON attachments(direct_message_id)`
  ,`CREATE TABLE IF NOT EXISTS channel_categories (id TEXT PRIMARY KEY,server_id TEXT NOT NULL REFERENCES servers(id) ON DELETE CASCADE,name TEXT NOT NULL,position INTEGER NOT NULL DEFAULT 0)`
  ,`CREATE TABLE IF NOT EXISTS category_roles (category_id TEXT NOT NULL REFERENCES channel_categories(id) ON DELETE CASCADE,role_id TEXT NOT NULL REFERENCES server_roles(id) ON DELETE CASCADE,PRIMARY KEY(category_id,role_id))`
  ,`CREATE TABLE IF NOT EXISTS channel_roles (channel_id TEXT NOT NULL REFERENCES channels(id) ON DELETE CASCADE,role_id TEXT NOT NULL REFERENCES server_roles(id) ON DELETE CASCADE,PRIMARY KEY(channel_id,role_id))`
  ,`CREATE TABLE IF NOT EXISTS server_member_roles (server_id TEXT NOT NULL,user_id TEXT NOT NULL,role_id TEXT NOT NULL,PRIMARY KEY(server_id,user_id,role_id),FOREIGN KEY(server_id,user_id) REFERENCES memberships(server_id,user_id) ON DELETE CASCADE,FOREIGN KEY(server_id,role_id) REFERENCES server_roles(server_id,id) ON DELETE CASCADE)`
];

// Migration unique demandée : aucun serveur précréé ni profil de démonstration.
export async function initializeApplication(db) {
  await db.transaction(async tx => {
    const applied = await tx.one('INSERT INTO app_migrations (id,applied_at) VALUES ($1,$2) ON CONFLICT DO NOTHING RETURNING id', ['user-created-servers-v1',new Date().toISOString()]);
    if (!applied) return;
    await tx.run('DELETE FROM servers');
    await tx.run("DELETE FROM users WHERE id IN ('alice','leo','nora','max') AND email IS NULL");
  });
}
