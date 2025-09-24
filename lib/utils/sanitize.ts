const CONTROL_CHARS = /[\u0000-\u001f\u007f]/g;
const ANGLE_BRACKETS = /[<>]/g;
const NON_PHONE = /[^\d+]/g;
const NON_HANDLE = /[^a-z0-9_-]/gi;
const NON_OTP = /[^\d]/g;

export function sanitizeHandle(value: string): string {
  return value.normalize("NFKC").replace(CONTROL_CHARS, "").replace(ANGLE_BRACKETS, "").replace(NON_HANDLE, "");
}

export function sanitizePlainText(value: string): string {
  return value.normalize("NFKC").replace(CONTROL_CHARS, "").replace(ANGLE_BRACKETS, "").trim();
}

export function sanitizePhone(value: string): string {
  return value.replace(CONTROL_CHARS, "").replace(NON_PHONE, "");
}

export function sanitizeOtpCode(value: string): string {
  return value.replace(NON_OTP, "");
}
