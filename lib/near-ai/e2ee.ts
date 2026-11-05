import { ed25519, x25519 } from "@noble/curves/ed25519.js";
import { xchacha20poly1305 } from "@noble/ciphers/chacha.js";
import { hkdfSync, randomBytes } from "node:crypto";

/**
 * NEAR AI Cloud end-to-end encryption, protocol version 2.
 *
 * Mirrors py/encrypted_agent_loop_verifier.py in nearai/nearai-cloud-verifier:
 *   - The model's attested Ed25519 signing key is converted to X25519.
 *   - Per message: ephemeral X25519 key, ECDH, HKDF-SHA256(salt=None,
 *     info="ed25519_encryption", 32 bytes), XChaCha20-Poly1305 (24-byte nonce).
 *   - Wire format (hex): ephemeral_pub(32) | nonce(24) | ciphertext+tag
 *   - Request headers: X-Signing-Algo: ed25519, X-Client-Pub-Key: <hex>,
 *     X-Encryption-Version: 2, X-Encrypt-All-Fields: true
 *
 * Effect: message contents are encrypted from VEIL AI's server to the
 * inference enclave. The NEAR AI gateway and any intermediary only see
 * ciphertext; responses are encrypted back to a per-request client key.
 */

const INFO = Buffer.from("ed25519_encryption");
// HKDF with salt=None uses a zero-filled salt of hash length (RFC 5869 §2.2).
const ZERO_SALT = Buffer.alloc(32);

function hexToBytes(hex: string): Uint8Array {
  const clean = hex.replace(/^0x/i, "");
  if (!/^[0-9a-fA-F]*$/.test(clean) || clean.length % 2 !== 0) throw new Error("invalid hex");
  return Uint8Array.from(Buffer.from(clean, "hex"));
}

function deriveKey(shared: Uint8Array): Uint8Array {
  return new Uint8Array(hkdfSync("sha256", shared, ZERO_SALT, INFO, 32));
}

export interface E2eeSession {
  clientPublicKeyHex: string;
  headers: Record<string, string>;
  encrypt(plaintext: string): string;
  decrypt(ciphertextHex: string): string;
  tryDecrypt(value: string): string | null;
}

export function createE2eeSession(modelEd25519PublicKeyHex: string): E2eeSession {
  const modelEdPub = hexToBytes(modelEd25519PublicKeyHex);
  if (modelEdPub.length !== 32) throw new Error(`Ed25519 public key must be 32 bytes, got ${modelEdPub.length}`);
  const modelX = ed25519.utils.toMontgomery(modelEdPub);

  // Per-request client Ed25519 key; private part never leaves this process.
  const clientSeed = Uint8Array.from(randomBytes(32));
  const clientEdPub = ed25519.getPublicKey(clientSeed);
  const clientXSecret = ed25519.utils.toMontgomerySecret(clientSeed);
  const clientPublicKeyHex = Buffer.from(clientEdPub).toString("hex");

  const encrypt = (plaintext: string): string => {
    const eph = x25519.keygen();
    const shared = x25519.getSharedSecret(eph.secretKey, modelX);
    const key = deriveKey(shared);
    const nonce = Uint8Array.from(randomBytes(24));
    const ct = xchacha20poly1305(key, nonce).encrypt(new TextEncoder().encode(plaintext));
    return Buffer.concat([eph.publicKey, nonce, ct]).toString("hex");
  };

  const decrypt = (ciphertextHex: string): string => {
    const blob = hexToBytes(ciphertextHex);
    if (blob.length < 32 + 24 + 16) throw new Error("ciphertext too short");
    const ephPub = blob.subarray(0, 32);
    const nonce = blob.subarray(32, 56);
    const ct = blob.subarray(56);
    const shared = x25519.getSharedSecret(clientXSecret, ephPub);
    const key = deriveKey(shared);
    return new TextDecoder().decode(xchacha20poly1305(key, nonce).decrypt(ct));
  };

  return {
    clientPublicKeyHex,
    headers: {
      "X-Signing-Algo": "ed25519",
      "X-Client-Pub-Key": clientPublicKeyHex,
      "X-Encryption-Version": "2",
      "X-Encrypt-All-Fields": "true",
    },
    encrypt,
    decrypt,
    tryDecrypt(value: string) {
      if (!value || value.length % 2 !== 0 || !/^[0-9a-fA-F]+$/.test(value)) return null;
      try {
        return decrypt(value);
      } catch {
        return null;
      }
    },
  };
}

/** Test helper: simulate the enclave side of the protocol. */
export function __enclaveForTests() {
  const seed = Uint8Array.from(randomBytes(32));
  const pub = ed25519.getPublicKey(seed);
  const xSecret = ed25519.utils.toMontgomerySecret(seed);
  return {
    publicKeyHex: Buffer.from(pub).toString("hex"),
    decryptFromClient(hex: string) {
      const blob = hexToBytes(hex);
      const shared = x25519.getSharedSecret(xSecret, blob.subarray(0, 32));
      return new TextDecoder().decode(xchacha20poly1305(deriveKey(shared), blob.subarray(32, 56)).decrypt(blob.subarray(56)));
    },
    encryptToClient(plaintext: string, clientEdPubHex: string) {
      const clientX = ed25519.utils.toMontgomery(hexToBytes(clientEdPubHex));
      const eph = x25519.keygen();
      const key = deriveKey(x25519.getSharedSecret(eph.secretKey, clientX));
      const nonce = Uint8Array.from(randomBytes(24));
      return Buffer.concat([eph.publicKey, nonce, xchacha20poly1305(key, nonce).encrypt(new TextEncoder().encode(plaintext))]).toString("hex");
    },
  };
}
