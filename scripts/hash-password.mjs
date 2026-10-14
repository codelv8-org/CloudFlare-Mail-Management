import { createInterface } from 'node:readline/promises';
import { Writable } from 'node:stream';
import { hashPassword } from '../lib/auth-core.mjs';
// Read from stdin; never put the password in shell arguments or environment variables.
const hidden = new Writable({ write(_chunk, _encoding, callback) { callback(); } });
const rl = createInterface({ input: process.stdin, output: hidden, terminal: Boolean(process.stdin.isTTY) });
try {
  process.stderr.write('New administrator password (12–256 characters, input hidden): ');
  const password = await rl.question('');
  process.stderr.write('\n');
  console.log(await hashPassword(password));
} finally { rl.close(); }
