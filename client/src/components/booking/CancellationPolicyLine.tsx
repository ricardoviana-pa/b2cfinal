import { cancellationPolicyCopy, cancellationPolicyInfo, cancellationPolicyPath } from "@/lib/cancellation";

/**
 * One rate's cancellation policy as a sentence. Guesty's code gives the rule
 * (shared/cancellationPolicy.ts); when the code is unknown the sentence says
 * "the cancellation terms of your rate" and links to them, so nothing is ever
 * invented. Callers pass planPolicyCode(plan) so the same plan reads the same
 * everywhere; Guesty's internal plan name is never shown.
 */
export default function CancellationPolicyLine({
  code,
  checkIn,
  lang,
  className,
  linkClassName = "underline underline-offset-2 hover:opacity-70",
  as: Tag = "p",
  alwaysLink = false,
}: {
  code: unknown;
  checkIn?: string | null;
  lang: string;
  className?: string;
  linkClassName?: string;
  as?: "p" | "span" | "div";
  /** Also link to the policy section when the code is known. */
  alwaysLink?: boolean;
}) {
  const info = cancellationPolicyInfo(code, checkIn, lang);
  const showLink = alwaysLink || !info.known;
  return (
    <Tag className={className}>
      {info.text}
      {showLink && (
        <>
          {" "}
          <a
            href={cancellationPolicyPath(lang, info.code)}
            target="_blank"
            rel="noopener noreferrer"
            onClick={(e) => e.stopPropagation()}
            className={linkClassName}
          >
            {cancellationPolicyCopy(lang).termsLink}
          </a>
        </>
      )}
    </Tag>
  );
}
