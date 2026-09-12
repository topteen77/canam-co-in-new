export function getJwtSecret() {
  return process.env.JWT_SECRET || 'your-secret-key-change-this';
}

export const JWT_SECRET = process.env.JWT_SECRET || 'your-secret-key-change-this';
export const JWT_EXPIRES_IN = '24h';
