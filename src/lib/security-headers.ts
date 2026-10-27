const SUPABASE_CONNECT_SRC = (() => {
  const raw = import.meta.env["VITE_SUPABASE_URL"] || process.env["SUPABASE_URL"];
  if (!raw) return ["https://*.supabase.co", "wss://*.supabase.co"];
  try {
    const { host } = new URL(raw);
    return [`https://${host}`, `wss://${host}`];
  } catch {
    return ["https://*.supabase.co", "wss://*.supabase.co"];
  }
})();

// Scripts stay inline-friendly because the router hydrates through inline scripts.
const CONTENT_SECURITY_POLICY = [
  "default-src 'self'",
  "script-src 'self' 'unsafe-inline'",
  "style-src 'self' 'unsafe-inline' https://fonts.googleapis.com",
  "font-src 'self' https://fonts.gstatic.com data:",
  "img-src 'self' data: blob:",
  `connect-src 'self' ${SUPABASE_CONNECT_SRC.join(" ")}`,
  "frame-ancestors 'none'",
  "base-uri 'self'",
  "form-action 'self'",
  "object-src 'none'",
  "upgrade-insecure-requests",
].join("; ");

const STATIC_HEADERS: Record<string, string> = {
  "X-Content-Type-Options": "nosniff",
  "Referrer-Policy": "strict-origin-when-cross-origin",
  "Strict-Transport-Security": "max-age=31536000; includeSubDomains",
  "Cross-Origin-Opener-Policy": "same-origin-allow-popups",
  "Permissions-Policy":
    "camera=(), microphone=(), geolocation=(), payment=(), usb=(), magnetometer=(), gyroscope=(), accelerometer=()",
};

export function applySecurityHeaders(response: Response): Response {
  const headers = new Headers(response.headers);
  for (const [name, value] of Object.entries(STATIC_HEADERS)) headers.set(name, value);
  // CSP is production-only so the Vite dev server's HMR websocket and http origin keep working.
  if (import.meta.env.PROD) headers.set("Content-Security-Policy", CONTENT_SECURITY_POLICY);
  return new Response(response.body, {
    status: response.status,
    statusText: response.statusText,
    headers,
  });
}
