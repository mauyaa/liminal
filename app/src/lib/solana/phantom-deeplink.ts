import nacl from "tweetnacl";
import bs58 from "bs58";

/**
 * Real implementation of Phantom's documented deeplink protocol
 * (https://phantom.app/ul/v1/*) for mobile contexts where a browser
 * extension isn't available - Telegram in-app browsers, native mobile apps.
 * This is a genuine Diffie-Hellman encrypted session, not a bare URL: the
 * checklist this was built from described a simplified
 * `phantom://ul/v1/signAndSendTransaction?transaction=...` link, but
 * Phantom's real spec requires a prior encrypted Connect handshake first -
 * a plain unencrypted link does not work against the actual Phantom app.
 */

export interface DappKeyPair {
  publicKey: Uint8Array;
  secretKey: Uint8Array;
}

export function generateDappKeyPair(): DappKeyPair {
  return nacl.box.keyPair();
}

export function encodeKey(key: Uint8Array): string {
  return bs58.encode(key);
}

export function decodeKey(key: string): Uint8Array {
  return bs58.decode(key);
}

function sharedSecret(theirPublicKeyB58: string, mySecretKey: Uint8Array): Uint8Array {
  return nacl.box.before(decodeKey(theirPublicKeyB58), mySecretKey);
}

/** Decrypts a Phantom response `data` (bs58) using its `nonce` (bs58) and the session's shared secret. */
export function decryptPayload<T>(dataB58: string, nonceB58: string, theirPublicKeyB58: string, mySecretKey: Uint8Array): T {
  const secret = sharedSecret(theirPublicKeyB58, mySecretKey);
  const decrypted = nacl.box.open.after(decodeKey(dataB58), decodeKey(nonceB58), secret);
  if (!decrypted) {
    throw new Error("failed to decrypt Phantom response - wrong session or tampered payload");
  }
  return JSON.parse(Buffer.from(decrypted).toString("utf8")) as T;
}

/** Encrypts a request payload to send to Phantom, returning bs58-encoded nonce + ciphertext for the URL. */
export function encryptPayload(
  payload: unknown,
  theirPublicKeyB58: string,
  mySecretKey: Uint8Array
): { nonce: string; payload: string } {
  const secret = sharedSecret(theirPublicKeyB58, mySecretKey);
  const nonce = nacl.randomBytes(24);
  const message = Buffer.from(JSON.stringify(payload), "utf8");
  const encrypted = nacl.box.after(message, nonce, secret);
  return { nonce: encodeKey(nonce), payload: encodeKey(encrypted) };
}

export function buildConnectUrl(params: {
  dappEncryptionPublicKey: string;
  appUrl: string;
  redirectLink: string;
  cluster?: "mainnet-beta" | "testnet" | "devnet";
}): string {
  const qs = new URLSearchParams({
    app_url: params.appUrl,
    dapp_encryption_public_key: params.dappEncryptionPublicKey,
    redirect_link: params.redirectLink,
    cluster: params.cluster ?? "devnet",
  });
  return `https://phantom.app/ul/v1/connect?${qs.toString()}`;
}

export function buildSignAndSendUrl(params: {
  dappEncryptionPublicKey: string;
  nonce: string;
  redirectLink: string;
  payload: string;
}): string {
  const qs = new URLSearchParams({
    dapp_encryption_public_key: params.dappEncryptionPublicKey,
    nonce: params.nonce,
    redirect_link: params.redirectLink,
    payload: params.payload,
  });
  return `https://phantom.app/ul/v1/signAndSendTransaction?${qs.toString()}`;
}
