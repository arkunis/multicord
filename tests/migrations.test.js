import { it } from 'node:test';
import assert from 'node:assert/strict';
import { openDatabase, initializeApplication } from '../server/db.js';
import { initializeHandles,findHandle } from '../server/identity.js';

it('attribue un identifiant aux comptes existants sans modifier leur pseudo et le conserve au redémarrage',async()=>{
  const db=await openDatabase('',':memory:');
  try{
    for(const id of ['legacy-a','legacy-b'])await db.run('INSERT INTO users (id,username,email,color,created_at) VALUES ($1,$2,$3,$4,$5)',[id,'Éloïse',`${id}@example.test`,'#b9d8b2',new Date().toISOString()]);
    await initializeHandles(db);
    const first=await db.all('SELECT * FROM user_handles ORDER BY user_id');
    assert.equal(first.length,2);assert.notEqual(first[0].discriminator,first[1].discriminator);
    await initializeHandles(db);assert.deepEqual(await db.all('SELECT * FROM user_handles ORDER BY user_id'),first);
    const found=await findHandle(db,'éloïse#'+first[0].discriminator.toLowerCase());assert.equal(found.id,'legacy-a');assert.equal(found.username,'Éloïse');
    assert.equal(await findHandle(db,'Autre nom#'+first[0].discriminator),null);
  }finally{await db.close();}
});

it('ne supprime les anciens serveurs qu’une fois et conserve les créations ultérieures', async()=>{
  const db=await openDatabase('',':memory:');
  try{
    await db.run('INSERT INTO users (id,username,color,created_at) VALUES ($1,$2,$3,$4)',['owner','Propriétaire','#b9d8b2',new Date().toISOString()]);
    const create=id=>db.run('INSERT INTO servers VALUES ($1,$2,$3,$4,$5,$6)',[id,'Un serveur','Description','#b9d8b2','owner',new Date().toISOString()]);
    await create('ancien');await initializeApplication(db);
    assert.equal((await db.all('SELECT id FROM servers')).length,0);
    await create('nouveau');await initializeApplication(db);
    assert.equal((await db.one('SELECT id FROM servers')).id,'nouveau');
  }finally{await db.close();}
});
it('annule entièrement une création échouée et isole les lectures concurrentes',async()=>{
  const db=await openDatabase('',':memory:');
  try{
    const write=db.transaction(async tx=>{
      await tx.run('INSERT INTO users (id,username,color,created_at) VALUES ($1,$2,$3,$4)',['rollback','Test','#b9d8b2',new Date().toISOString()]);
      throw new Error('Échec simulé');
    });
    const read=db.all('SELECT id FROM users');
    await assert.rejects(write,/Échec simulé/);
    assert.deepEqual(await read,[]);
  }finally{await db.close();}
});
