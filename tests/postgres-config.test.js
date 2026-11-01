import { it } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, writeFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { postgresOptions } from '../server/db.js';

it('borne le pool PostgreSQL pour préserver la limite de connexions Aiven', () => {
  assert.equal(postgresOptions('postgres://localhost/test', {}).max, 5);
  for (const max of ['0', '15', 'Infinity', '1.5', 'invalid']) assert.throws(() => postgresOptions('postgres://localhost/test', { DATABASE_POOL_MAX: max }));
});
it('impose la CA et la validation TLS même si l’URL contient des paramètres SSL', () => {
  const dir = mkdtempSync(join(tmpdir(), 'multicord-tls-'));
  try {
    const path = join(dir, 'ca.pem');
    writeFileSync(path, 'test-certificate');
    const options = postgresOptions('postgres://localhost/test?sslmode=no-verify&uselibpqcompat=true', { DATABASE_SSL_CA_FILE: path });
    assert.equal(options.ssl.rejectUnauthorized, true);
    assert.equal(options.ssl.ca, 'test-certificate');
    assert.equal(new URL(options.connectionString).searchParams.has('sslmode'), false);
    assert.equal(new URL(options.connectionString).searchParams.has('uselibpqcompat'), false);
  } finally { rmSync(dir, { recursive: true, force: true }); }
});
it('échoue si la CA configurée manque au lieu de réduire la sécurité', () => {
  assert.throws(() => postgresOptions('postgres://localhost/test', { DATABASE_SSL_CA_FILE: 'absent-ca.pem' }), { code: 'ENOENT' });
});
