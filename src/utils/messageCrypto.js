const crypto = require('crypto');

// String format: enc.v1.<base64(iv)>.<base64(ciphertext)>.<base64(tag)>
const PREFIX = 'enc.v1.';

function getKeyBuffer() {
  const raw = process.env.MESSAGE_ENC_KEY || '';
  if (!raw) {
    if (process.env.DISABLE_MESSAGE_ENCRYPTION === 'true') return null;
    throw new Error(
      'MESSAGE_ENC_KEY env var is not set. Generate a 32-byte key (base64 or hex) and set MESSAGE_ENC_KEY.'
    );
  }
  // Try base64 then hex
  let buf = null;
  try {
    const b = Buffer.from(raw, 'base64');
    if (b.length === 32) buf = b;
  } catch (_) {}
  if (!buf) {
    try {
      const h = Buffer.from(raw, 'hex');
      if (h.length === 32) buf = h;
    } catch (_) {}
  }
  if (!buf) {
    throw new Error(
      'Invalid MESSAGE_ENC_KEY. Provide 32 bytes as base64 or hex.'
    );
  }
  return buf;
}

function isEncrypted(value) {
  return typeof value === 'string' && value.startsWith(PREFIX);
}

function encryptText(plaintext) {
  if (plaintext == null) return plaintext;
  const key = getKeyBuffer();
  if (!key) return plaintext; // pass-through if explicitly disabled
  const iv = crypto.randomBytes(12);
  const cipher = crypto.createCipheriv('aes-256-gcm', key, iv);
  const ciphertext = Buffer.concat([
    cipher.update(String(plaintext), 'utf8'),
    cipher.final(),
  ]);
  const tag = cipher.getAuthTag();
  return (
    PREFIX +
    iv.toString('base64') +
    '.' +
    ciphertext.toString('base64') +
    '.' +
    tag.toString('base64')
  );
}

function decryptText(encValue) {
  if (!isEncrypted(encValue)) return encValue;
  const key = getKeyBuffer();
  if (!key) throw new Error('Encryption disabled but encrypted data encountered.');
  const parts = encValue.split('.');
  if (parts.length !== 5) throw new Error('Malformed encrypted value.');
  // parts: [ 'enc', 'v1', base64(iv), base64(ct), base64(tag) ]
  const iv = Buffer.from(parts[2], 'base64');
  const ciphertext = Buffer.from(parts[3], 'base64');
  const tag = Buffer.from(parts[4], 'base64');
  const decipher = crypto.createDecipheriv('aes-256-gcm', key, iv);
  decipher.setAuthTag(tag);
  const plaintext = Buffer.concat([
    decipher.update(ciphertext),
    decipher.final(),
  ]);
  return plaintext.toString('utf8');
}

function safeDecrypt(value) {
  try {
    return decryptText(value);
  } catch (err) {
    // Don’t crash the request pipeline; log and pass through
    if (console && console.warn) {
      console.warn('[messageCrypto] Failed to decrypt value:', err.message);
    }
    return value;
  }
}

module.exports = {
  encryptText,
  decryptText,
  safeDecrypt,
  isEncrypted,
};

