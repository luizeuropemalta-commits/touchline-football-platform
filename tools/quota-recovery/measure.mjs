// node --conditions=react-server --experimental-strip-types tools/quota-recovery/measure.mjs --check
// This CLI never prepares/finalizes cases, activates workers or changes plans.
import { diagnoseRecoveryOperatorConfig, readRecoveryOperatorConfig, readRecoveryArguments } from './config.mjs';

try {
  const args = readRecoveryArguments(process.argv.slice(2));
  if (args.mode === 'diagnose') {
    const diagnosis = diagnoseRecoveryOperatorConfig(process.env);
    process.stdout.write(JSON.stringify(diagnosis) + '\n');
    if (!diagnosis.configured) process.exitCode = 1;
  } else {
    const config = readRecoveryOperatorConfig(process.env);
    if (args.mode === 'check') {
      // Offline only: no pg import, connection, secret output or provider request.
      process.stdout.write(JSON.stringify({ configured: true, connected: false, measured: false }) + '\n');
    } else {
      const { Client } = await import('pg');
      const { createRecoveryOperatorPort } = await import('./operator-port.mjs');
      const { createRecoveryMeasurement } = await import('../../lib/football-data/recovery-measurement-server.ts');
      const operator = createRecoveryOperatorPort(config.operator, () => new Client(config.database));
      const measurement = createRecoveryMeasurement({ enabled: true, caseId: args.caseId,
        workerId: args.workerId, relativePath: args.relativePath, apiToken: config.apiToken }, operator);
      const controller = new AbortController();
      const stop = () => controller.abort();
      process.once('SIGINT', stop); process.once('SIGTERM', stop);
      const deadline = setTimeout(stop, 20000);
      try {
        const result = await measurement.run(controller.signal);
        process.stdout.write(JSON.stringify(result) + '\n');
        if (result.state !== 'recorded') process.exitCode = 1;
      } finally {
        clearTimeout(deadline); process.removeListener('SIGINT', stop); process.removeListener('SIGTERM', stop);
      }
    }
  }
} catch {
  // Never print driver errors, URLs, connection config or stack traces.
  process.stderr.write('Recovery operator unavailable; no automatic retry.\n');
  process.exitCode = 1;
}
