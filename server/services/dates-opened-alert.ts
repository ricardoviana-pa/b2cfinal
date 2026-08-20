/**
 * "Your dates just opened" — the alert no OTA sends for us.
 *
 * Guests who searched dates the site couldn't serve leave their email
 * (source "search-no-availability", with checkin/checkout/guests in
 * metadata). This sweep runs after each Guesty sync: when a cancellation
 * frees a lead's EXACT dates, the guest gets one email naming the homes that
 * opened, and the lead is stamped so it never fires twice. Highest-intent
 * email this system can produce — they told us the dates, the party size and
 * where to reach them.
 */
import * as db from "../db";
import { datesAreBookable } from "./search-hint";
import { sendDatesOpenedEmail } from "./transactional-email";

const MAX_LEAD_AGE_DAYS = 90;
const MAX_ALERTS_PER_RUN = 20;

const ymd = () => new Date().toISOString().slice(0, 10);

export async function runDatesOpenedAlerts(): Promise<string> {
  const all = await db.listLeads({ source: "search-no-availability" });
  const today = ymd();
  const cutoff = Date.now() - MAX_LEAD_AGE_DAYS * 86400000;

  const eligible = all.filter((l: any) => {
    if (!["new", "contacted"].includes(l.status)) return false;
    const m = l.metadata || {};
    if (m.datesOpenedNotifiedAt) return false;               // never twice
    if (!/^\d{4}-\d{2}-\d{2}$/.test(m.checkin || "")) return false;
    if (m.checkin <= today) return false;                     // stay must be ahead
    if (new Date(l.createdAt).getTime() < cutoff) return false;
    return true;
  });

  let sent = 0;
  for (const lead of eligible.slice(0, MAX_ALERTS_PER_RUN)) {
    const m = lead.metadata || {};
    try {
      const check = await datesAreBookable(m.checkin, m.checkout, Number(m.guests) || 2);
      if (!check.available) continue;
      await sendDatesOpenedEmail({
        email: lead.email,
        name: lead.name || undefined,
        checkIn: m.checkin,
        checkOut: m.checkout,
        guests: m.guests || "2",
        locale: m.locale,
        homes: check.homes,
      });
      await db.updateLead(lead.id, {
        status: "contacted",
        metadata: { ...m, datesOpenedNotifiedAt: new Date().toISOString() },
      });
      sent++;
      console.info(`[DatesOpened] Alert sent to lead #${lead.id} for ${m.checkin} → ${m.checkout}`);
    } catch (err: any) {
      console.warn(`[DatesOpened] lead #${lead.id} failed: ${err?.message ?? err}`);
    }
  }
  const summary = `checked ${eligible.length} eligible leads, sent ${sent} alerts`;
  console.info(`[DatesOpened] ${summary}`);
  return summary;
}
