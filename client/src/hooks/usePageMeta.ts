import { useEffect } from 'react';

const BASE_TITLE = 'Portugal Active';
const BASE_DESC = 'Private homes in Portugal, operated to hotel standards. Professional housekeeping, local concierge, verified preparation.';

export function usePageMeta(opts?: { title?: string; description?: string }) {
  useEffect(() => {
    const title = opts?.title ? `${opts.title} — ${BASE_TITLE}` : `${BASE_TITLE} — Private Homes, Hotel Standards`;
    document.title = title;

    const ogTitle = document.querySelector('meta[property="og:title"]');
    if (ogTitle) ogTitle.setAttribute('content', title);
    const twTitle = document.querySelector('meta[name="twitter:title"]');
    if (twTitle) twTitle.setAttribute('content', title);

    if (opts?.description) {
      const desc = document.querySelector('meta[name="description"]');
      if (desc) desc.setAttribute('content', opts.description);
      const ogDesc = document.querySelector('meta[property="og:description"]');
      if (ogDesc) ogDesc.setAttribute('content', opts.description);
      const twDesc = document.querySelector('meta[name="twitter:description"]');
      if (twDesc) twDesc.setAttribute('content', opts.description);
    }

    return () => {
      document.title = `${BASE_TITLE} — Private Homes, Hotel Standards`;
      const desc = document.querySelector('meta[name="description"]');
      if (desc) desc.setAttribute('content', BASE_DESC);
    };
  }, [opts?.title, opts?.description]);
}
