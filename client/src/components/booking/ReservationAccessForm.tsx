import { useState } from "react";
import { useTranslation } from "react-i18next";
import { receiptAccessCopy } from "@shared/receipt-access-copy";

export default function ReservationAccessForm({ reservationId }: { reservationId: string }) {
  const { i18n } = useTranslation();
  const copy = receiptAccessCopy(i18n.language);
  const [email, setEmail] = useState("");
  const [state, setState] = useState<"ready" | "sending" | "sent" | "failed">("ready");
  return <div className="mx-auto max-w-[460px] rounded-lg border border-pa-sand bg-white p-6 sm:p-8">
    <h1 className="headline-md text-pa-dark mb-4">{copy.heading}</h1>
    {state === "sent" ? <p role="status" className="body-md">{copy.sent}</p> : <>
      <p className="body-md mb-6">{copy.prompt}</p>
      <form onSubmit={async event => {
        event.preventDefault();
        setState("sending");
        try {
          const response = await fetch(`/api/reservations/${encodeURIComponent(reservationId)}/access`, {
            method: "POST", headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ email, locale: i18n.language.slice(0, 2) }),
          });
          setState(response.ok ? "sent" : "failed");
        } catch { setState("failed"); }
      }} className="space-y-4">
        <label className="block text-sm text-pa-dark">
          {copy.email}
          <input type="email" autoComplete="email" required maxLength={320} value={email}
            onChange={event => setEmail(event.target.value)}
            className="mt-2 w-full rounded-lg border border-pa-sand bg-white px-4 py-3" />
        </label>
        <button type="submit" disabled={state === "sending"} className="btn-primary w-full disabled:opacity-60">{copy.button}</button>
        {state === "failed" ? <p role="alert" className="body-sm text-destructive">{copy.failed}</p> : null}
      </form>
    </>}
  </div>;
}
