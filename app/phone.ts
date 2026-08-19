export function normalizePhoneNumber(value?: string | null) {
  const original = value?.trim() || "";
  if (!original) return "";
  let digits = original.replace(/\D/g, "");
  if (digits.length === 11 && digits.startsWith("1")) digits = digits.slice(1);
  if (digits.length !== 10) return original;
  return `(${digits.slice(0, 3)}) ${digits.slice(3, 6)}-${digits.slice(6)}`;
}

export function phoneCallHref(value?: string | null) {
  const original = value?.trim() || "";
  if (!original) return undefined;
  let digits = original.replace(/\D/g, "");
  if (digits.length === 11 && digits.startsWith("1")) digits = digits.slice(1);
  return digits.length === 10 ? `tel:+1${digits}` : `tel:${original.replace(/[^\d+]/g, "")}`;
}
