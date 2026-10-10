import assert from 'node:assert/strict';
import { createRequire } from 'node:module';
import { createServer, type Socket } from 'node:net';
import { once } from 'node:events';
import test from 'node:test';
import { createRecoveryOperatorPort } from '../../tools/quota-recovery/operator-port.mjs';

// Actual pinned operational pg driver. This is a loopback transport failure
// proof, not a SQL, remote TLS identity, or successful authentication proof.
const { Client } = createRequire(new URL('../../tools/quota-recovery/package.json', import.meta.url))('pg');
const args = { caseId: '11111111-1111-4111-8111-111111111111', workerId: 'qa-recovery',
  requestId: '22222222-2222-4222-8222-222222222222', endpoint: 'team', budgetMs: 18000 };

for (const abort of [false, true]) {
  test(`real pg stalled TLS handshake closes its socket on ${abort ? 'abort' : 'deadline'}, with no retry or SQL`, { timeout: 5000 }, async () => {
    const sockets = new Set<Socket>();
    let connections = 0, queries = 0, clients = 0;
    let hello!: () => void;
    const helloSeen = new Promise<void>(resolve => { hello = resolve; });
    let peerClosed!: () => void;
    const closed = new Promise<void>(resolve => { peerClosed = resolve; });
    const server = createServer(socket => {
      sockets.add(socket); connections++;
      socket.on('error', () => {});
      socket.on('close', () => { sockets.delete(socket); peerClosed(); });
      let sslRequest = Buffer.alloc(0), accepted = false, tlsObserved = false;
      socket.on('data', bytes => {
        if (!accepted) {
          sslRequest = Buffer.concat([sslRequest, bytes]);
          if (sslRequest.length < 8) return;
          assert.equal(sslRequest.length, 8);
          assert.equal(sslRequest.readInt32BE(0), 8);
          assert.equal(sslRequest.readInt32BE(4), 80877103);
          accepted = true; socket.write('S');
        } else if (!tlsObserved) {
          assert.equal(bytes[0], 22, 'positive control: the driver started a TLS handshake');
          tlsObserved = true;
          hello(); // Deliberately never send ServerHello or a certificate.
        }
      });
    });
    const controller = new AbortController();
    try {
      server.listen(0, '127.0.0.1'); await once(server, 'listening');
      const address = server.address(); assert.ok(address && typeof address !== 'string');
      const operator = createRecoveryOperatorPort({ accountScope: 'central', expectedRole: 'postgres', database: 'postgres', timeoutMs: 600 }, () => {
        clients++;
        const client = new Client({ host: '127.0.0.1', port: address.port, user: 'postgres', database: 'postgres',
          password: 'synthetic-never-send-secret', ssl: { rejectUnauthorized: true, servername: 'localhost' },
          connectionTimeoutMillis: 2500, keepAlive: false });
        const query = client.query.bind(client);
        client.query = (...values: unknown[]) => { queries++; return query(...values); };
        return client;
      });
      const rejection = assert.rejects(operator.admit(args, controller.signal), { message: 'Recovery operator unavailable.' });
      await helloSeen;
      if (abort) controller.abort();
      await rejection;
      const rejectedAt = performance.now();
      // A rejected Promise alone is insufficient: prove the actual socket dies.
      await closed;
      assert.ok(performance.now() - rejectedAt < 750, 'socket must close promptly, not wait for the independent pg connection timeout');
      assert.equal(clients, 1); assert.equal(connections, 1); assert.equal(queries, 0);
      assert.equal(sockets.size, 0);
    } finally {
      controller.abort();
      for (const socket of sockets) socket.destroy();
      await new Promise<void>(resolve => server.close(() => resolve()));
    }
  });
}
