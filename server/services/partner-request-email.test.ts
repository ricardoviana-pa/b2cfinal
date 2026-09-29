import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
const fake = vi.hoisted(() => ({ send: vi.fn() }));
vi.mock('resend', () => ({ Resend: class { emails = { send: fake.send }; } }));
const request = { id: 123, name: '<script>name</script>', email: 'guest@checkout.invalid', phone: '+000',
  message: '<img src=x onerror=alert(1)>', metadata: { propertyName: 'Synthetic & home', property: 'synthetic',
    checkin: '2099-01-01', checkout: '2099-01-04', guests: '2', total: '1200', locale: 'pt' } };
beforeEach(() => {
  vi.resetModules(); fake.send.mockReset().mockResolvedValue({ data: { id: 'synthetic-email' }, error: null });
  vi.stubEnv('RESEND_API_KEY', 'synthetic-mocked-provider'); vi.stubEnv('BOOKING_NOTIFICATION_EMAIL', 'booking@checkout.invalid');
  vi.stubEnv('APP_ENV', 'production'); vi.stubEnv('NODE_ENV', 'test'); vi.stubEnv('SITE_URL', 'https://www.portugalactive.com');
  vi.stubEnv('RENDER_SERVICE_ID', ''); vi.stubEnv('RENDER_GIT_BRANCH', '');
});
afterEach(() => vi.unstubAllEnvs());
describe('partner enquiry email', () => {
  it('routes internal request with reply-to, escaped fields and stable provider deduplication key', async () => {
    const { sendPartnerRequestEmail } = await import('./transactional-email');
    expect(await sendPartnerRequestEmail(request, 'team')).toBe('synthetic-email');
    const [mail, options] = fake.send.mock.calls[0];
    expect(mail.to).toBe('booking@checkout.invalid'); expect(mail.replyTo).toBe(request.email);
    expect(mail.html).toContain('&lt;script&gt;'); expect(mail.html).not.toContain('<img src=x');
    expect(mail.html).toContain('2099-01-01'); expect(mail.html).toContain('por confirmar');
    expect(options.idempotencyKey).toBe('partner-request-123-team-v1');
  });
  it.each(['pt', 'en'])('acknowledges receipt without promising a confirmed booking (%s)', async locale => {
    const { sendPartnerRequestEmail } = await import('./transactional-email');
    await sendPartnerRequestEmail({ ...request, metadata: { ...request.metadata, locale } }, 'guest');
    const mail = fake.send.mock.calls[0][0];
    expect(mail.to).toBe(request.email); expect(mail.replyTo).toBe('booking@checkout.invalid');
    expect(mail.html).toContain(locale === 'pt' ? 'ainda não está confirmada' : 'not a confirmed reservation');
  });
  it('rejects provider failure instead of recording fake success', async () => {
    fake.send.mockResolvedValue({ error: { message: 'synthetic error' } });
    const { sendPartnerRequestEmail } = await import('./transactional-email');
    await expect(sendPartnerRequestEmail(request, 'team')).rejects.toThrow('PARTNER_EMAIL_REJECTED');
  });
  it.each(['missing-provider', 'preview'])('fails closed in %s', async mode => {
    if (mode === 'missing-provider') vi.stubEnv('RESEND_API_KEY', ''); else vi.stubEnv('APP_ENV', 'preview');
    const { sendPartnerRequestEmail } = await import('./transactional-email');
    await expect(sendPartnerRequestEmail(request, 'team')).rejects.toThrow('PARTNER_EMAIL_UNAVAILABLE');
    expect(fake.send).not.toHaveBeenCalled();
  });
});
