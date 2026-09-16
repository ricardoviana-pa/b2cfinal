import { useEffect, useState } from "react";
import { isLiveSiteHostname } from "@shared/deployment";

export default function PreviewNotice() {
  const [preview, setPreview] = useState(false);
  useEffect(() => { setPreview(!isLiveSiteHostname(window.location.hostname)); }, []);
  if (!preview) return null;
  return <aside className="fixed bottom-3 left-3 z-[9999] max-w-[calc(100vw-1.5rem)] rounded border border-amber-300 bg-amber-50 px-3 py-2 text-xs text-amber-950 shadow" role="status">
    <strong>DEV · Testes visuais</strong> · Sem reservas, pagamentos ou envios reais.{' '}
    <a className="underline" href="/pt/checkout/demo">Checkout de demonstração</a>
  </aside>;
}
