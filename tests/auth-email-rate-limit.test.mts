import test from 'node:test';
import assert from 'node:assert/strict';
import { authEmailRateLimit, authEmailWaitMessage } from '../lib/touchlineArena/auth-email-rate-limit.ts';
test('all supported auth locales retain translated cooldown and unknown-deadline feedback', () => {
 for (const locale of ['pt-BR','es-ES','it-IT','fr-FR','ar-SA','tr-TR','de-DE']) {
  assert.notEqual(authEmailWaitMessage(locale,null),authEmailWaitMessage('en-GB',null));
  assert.notEqual(authEmailWaitMessage(locale,17),authEmailWaitMessage('en-GB',17));
  assert.match(authEmailWaitMessage(locale,17),/17/);
  assert.doesNotMatch(authEmailWaitMessage(locale,null),/\d/);
 }
 assert.equal(authEmailWaitMessage('unknown',null),authEmailWaitMessage('en-GB',null));
});
test('known provider cooldown yields exact deadline; hourly limit never invents one', () => {
 assert.deepEqual(authEmailRateLimit({code:'over_email_send_rate_limit',status:429,message:'For security purposes, you can only request this after 17 seconds.'}),{seconds:17});
 assert.deepEqual(authEmailRateLimit({code:'over_email_send_rate_limit',message:'email rate limit exceeded'}),{seconds:null});
 assert.deepEqual(authEmailRateLimit({status:429,message:'Wait 60 minutes'}),{seconds:null});
});
test('other errors never claim rate limiting or expose provider text', () => {
 for (const e of [null, new Error('network failure'),{code:'invalid_credentials',message:'only request this after 17 seconds.'}]) assert.equal(authEmailRateLimit(e),null);
 for (const n of ['0','999999999999999999999']) assert.deepEqual(authEmailRateLimit({status:429,message:`only request this after ${n} seconds.`}),{seconds:null});
 assert.match(authEmailWaitMessage('pt-BR',17),/17 segundos/);
 assert.match(authEmailWaitMessage('pt-BR',null),/Tente novamente mais tarde/);
 assert.match(authEmailWaitMessage('en-GB',null),/try again later/);
});
