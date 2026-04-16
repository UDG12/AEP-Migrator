import CryptoJS from 'crypto-js';
import { config } from '@/config';

const ENCRYPTION_KEY = config.security.encryptionKey;

/**
 * Encrypt sensitive data using AES-256
 */
export function encrypt(text: string): string {
  if (!text) return '';
  return CryptoJS.AES.encrypt(text, ENCRYPTION_KEY).toString();
}

/**
 * Decrypt encrypted data
 */
export function decrypt(encryptedText: string): string {
  if (!encryptedText) return '';
  const bytes = CryptoJS.AES.decrypt(encryptedText, ENCRYPTION_KEY);
  return bytes.toString(CryptoJS.enc.Utf8);
}

/**
 * Hash a password using PBKDF2
 */
export function hashPassword(password: string): string {
  return CryptoJS.PBKDF2(password, ENCRYPTION_KEY, {
    keySize: 256 / 32,
    iterations: 10000,
  }).toString();
}

/**
 * Encrypt credentials object
 */
export function encryptCredentials(credentials: Record<string, string>): Record<string, string> {
  const encrypted: Record<string, string> = {};
  for (const [key, value] of Object.entries(credentials)) {
    if (key === 'clientSecret' || key === 'accessToken') {
      encrypted[key] = encrypt(value);
    } else {
      encrypted[key] = value;
    }
  }
  return encrypted;
}

/**
 * Decrypt credentials object
 */
export function decryptCredentials(credentials: Record<string, string>): Record<string, string> {
  const decrypted: Record<string, string> = {};
  for (const [key, value] of Object.entries(credentials)) {
    if (key === 'clientSecret' || key === 'accessToken') {
      decrypted[key] = decrypt(value);
    } else {
      decrypted[key] = value;
    }
  }
  return decrypted;
}
