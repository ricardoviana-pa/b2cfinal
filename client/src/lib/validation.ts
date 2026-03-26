/**
 * Shared validation utilities for forms across the booking flow.
 */

/** Validates email format: local@domain.tld (TLD min 2 chars). */
export const isValidEmail = (email: string): boolean =>
  /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/.test(email.trim());

/** Validates phone: at least 7 digits, allows +, spaces, dashes, parentheses. */
export const isValidPhone = (phone: string): boolean =>
  /^\+?[\d\s\-()]{7,}$/.test(phone.trim());
