/**
 * Shared validation utilities for forms across the booking flow.
 */
import { phoneIssue } from "./phone";

/** Validates email format: local@domain.tld (TLD min 2 chars). */
export const isValidEmail = (email: string): boolean =>
  /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/.test(email.trim());

/**
 * Validates phone: the digits after the country code where the rule is fixed
 * (PT 9, GB 9-10, US 10…), otherwise the E.164 length (8 to 15 digits with the
 * country code). Before, any 7 characters passed ("+351 912" included) —
 * auditoria do funil, n.º 7. The reason for a refusal: phoneIssue/phoneIssueMessage.
 */
export const isValidPhone = (phone: string): boolean => phoneIssue(phone) == null;
