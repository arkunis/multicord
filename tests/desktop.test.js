import {it} from 'node:test';
import assert from 'node:assert/strict';
import {createRequire} from 'node:module';
const {validateServerUrl,validateConfig}=createRequire(import.meta.url)('../desktop/config.cjs');
it('réserve HTTP au service local et refuse les URL contenant des secrets ou des chemins',()=>{
 assert.equal(validateServerUrl(' https://multicord.example.test/ '),'https://multicord.example.test');
 assert.equal(validateServerUrl('http://localhost:3000'),'http://localhost:3000');
 for(const value of ['http://example.test','https://user:password@example.test','https://example.test/path','https://example.test?token=private','https://example.test#token','file:///C:/private','javascript:alert(1)','https://localhost.evil.test/path'])assert.throws(()=>validateServerUrl(value));
});
it('borne le port local et conserve une configuration de bureau minimale',()=>{
 const value=validateConfig({mode:'unknown',localPort:-1,closeToTray:false,secret:'never persist'});
 assert.equal(value.mode,'local');assert.equal(value.localPort,3000);assert.equal(value.closeToTray,false);assert.equal(value.secret,undefined);
});
