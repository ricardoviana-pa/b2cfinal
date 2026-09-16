import './setup';
import { describe, expect, it } from 'vitest';
import http from 'node:http';
import https from 'node:https';
import net from 'node:net';

describe('checkout integration runner network boundary', () => {
  it('blocks fetch, HTTP, HTTPS and sockets before any network request', () => {
    expect(() => fetch('https://checkout.invalid')).toThrow('CHECKOUT_SANDBOX_NETWORK_DISABLED');
    expect(() => http.get('http://checkout.invalid')).toThrow('CHECKOUT_SANDBOX_NETWORK_DISABLED');
    expect(() => https.request('https://checkout.invalid')).toThrow('CHECKOUT_SANDBOX_NETWORK_DISABLED');
    const socket = new net.Socket();
    expect(() => socket.connect(12345, '127.0.0.1')).toThrow('CHECKOUT_SANDBOX_NETWORK_DISABLED');
    socket.destroy();
  });
});
