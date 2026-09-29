import { emitKeypressEvents, createInterface } from 'node:readline';
import { stdin, stdout } from 'node:process';
import { readFile, writeFile } from 'node:fs/promises';
import { hashPassword } from '../backend/src/modules/workspace/password.js';
import { z } from 'zod';

if (!stdin.isTTY) throw new Error('Run this command in an interactive terminal. Password input is hidden.');
const rl = createInterface({ input: stdin, output: stdout });
const email = (await new Promise<string>(resolve => rl.question('Workspace owner email: ', resolve))).trim().toLowerCase();
rl.close();
if (!z.string().email().max(254).safeParse(email).success) throw new Error('Enter a valid email');
async function secret(label: string) {
  stdout.write(label); emitKeypressEvents(stdin); stdin.setRawMode(true); stdin.resume();
  return new Promise<string>((resolve, reject) => {
    let value = '';
    const listener = (text: string, key: { name?: string; ctrl?: boolean }) => {
      if (key?.name === 'return' || key?.ctrl && key.name === 'c') {
        stdin.off('keypress', listener); stdin.setRawMode(false); stdin.pause(); stdout.write('\n');
        if (key.ctrl) reject(new Error('Cancelled')); else resolve(value);
      } else if (key?.name === 'backspace') value = value.slice(0, -1);
      else if (text && !key?.ctrl && !text.includes('\u001b')) value += text;
    };
    stdin.on('keypress', listener);
  });
}
const password = await secret('Password (12+ characters, hidden): ');
if (password.length < 12 || password.length > 256) throw new Error('Use a password between 12 and 256 characters');
if (await secret('Confirm password (hidden): ') !== password) throw new Error('Passwords did not match');
const path = new URL('../backend/.env', import.meta.url);
let text = await readFile(path, 'utf8');
for (const [key, value] of Object.entries({ OWNER_EMAIL: email, OWNER_PASSWORD_HASH: await hashPassword(password) })) {
  const line = `${key}=${JSON.stringify(value)}`;
  text = new RegExp(`^${key}=.*$`, 'm').test(text) ? text.replace(new RegExp(`^${key}=.*$`, 'm'), () => line) : `${text.trimEnd()}\n${line}\n`;
}
await writeFile(path, text);
console.log('Owner sign-in configured in backend/.env. Restart the API. Copy OWNER_EMAIL and OWNER_PASSWORD_HASH to encrypted deployment settings; the password was not saved.');
