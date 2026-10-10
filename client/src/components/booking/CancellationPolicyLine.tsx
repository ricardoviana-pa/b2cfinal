import { cancellationPolicyCopy, cancellationPolicyInfo, cancellationPolicyPath } from "@/lib/cancellation";

/**
 * One rate's cancellation policy as a sentence. Guesty's code gives the rule
 * (shared/cancellationPolicy.ts); when the code is unknown the sentence names
 * the rate and links to the cancellation terms, so nothing is ever invented.
 */
export default function CancellationPolicyLine({
  code,
  checkIn,
  planName,
  lang,
  className,
  linkClassName = "underline underline-offset-2 hover:opacity-70",
  as: Tag = "p",
  alwaysLink = false,
}: {
  code: unknown;
  checkIn?: string | null;
  planName?: string | null;
  lang: string;
  className?: string;
  linkClassName?: string;
  as?: "p" | "span" | "div";
  /** Also link to the policy section when the code is known. */
  alwaysLink?: boolean;
}) {
  const info = cancellationPolicyInfo(code, checkIn, lang, planName);
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
