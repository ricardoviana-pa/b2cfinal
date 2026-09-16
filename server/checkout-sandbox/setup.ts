import { beforeAll, afterAll, vi } from 'vitest';
import net from 'node:net';
import http from 'node:http';
import https from 'node:https';

const configured = Object.keys(process.env).filter(key => /^(DATABASE_|GUESTY_|STRIPE_|RESEND_|TRIPWIX_|BOKUN_|ACTIVECAMPAIGN_|CLOUDFLARE_|GOOGLE_)/.test(key) && !!process.env[key]);
if (configured.length) throw new Error(`Checkout sandbox refuses operational configuration: ${configured.join(', ')}`);
if (process.env.NODE_ENV !== 'test') throw new Error('Checkout sandbox requires NODE_ENV=test');

function noNetwork(): never { throw new Error('CHECKOUT_SANDBOX_NETWORK_DISABLED'); }
// Installed before test-module imports; forgotten provider mocks fail closed.
const guards = [
  vi.spyOn(net.Socket.prototype, 'connect').mockImplementation(noNetwork),
  vi.spyOn(http, 'request').mockImplementation(noNetwork),
  vi.spyOn(http, 'get').mockImplementation(noNetwork),
  vi.spyOn(https, 'request').mockImplementation(noNetwork),
  vi.spyOn(https, 'get').mockImplementation(noNetwork),
];
vi.stubGlobal('fetch', noNetwork);
beforeAll(() => {
  if (process.env.CHECKOUT_RECOVERY === 'true') throw new Error('Recovery must remain disabled in the checkout sandbox');
});
afterAll(() => { guards.forEach(guard => guard.mockRestore()); vi.unstubAllGlobals(); });
