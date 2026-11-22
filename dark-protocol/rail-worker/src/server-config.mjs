export const DEFAULT_CORS_ORIGINS = [
  'http://127.0.0.1:5173',
  'http://localhost:5173',
];

export function truthyEnv(value) {
  return ['1', 'true', 'yes', 'on'].includes(String(value ?? '').toLowerCase());
}

export function allowedOriginsFromEnv(value) {
  const configured = String(value ?? '')
    .split(',')
    .map(origin => origin.trim())
    .filter(Boolean);

  return configured.length > 0 ? configured : DEFAULT_CORS_ORIGINS;
}

export function corsHeadersForOrigin(origin, allowedOrigins) {
  if (!origin) return {};
  if (allowedOrigins.includes('*')) {
    return {
      'access-control-allow-origin': '*',
    };
  }

  if (!allowedOrigins.includes(origin)) {
    return null;
  }

  return {
    'access-control-allow-origin': origin,
    vary: 'Origin',
  };
}
