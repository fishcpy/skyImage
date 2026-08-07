import { apiClient } from "@/lib/api";

export type Passkey = {
  id: number;
  name: string;
  credentialId: string;
  createdAt: string;
  lastUsedAt?: string;
};

type CreationOptions = {
  publicKey: {
    rp: { id: string; name: string };
    user: { id: string; name: string; displayName: string };
    challenge: string;
    pubKeyCredParams: Array<{ type: string; alg: number }>;
    timeout?: number;
    attestation?: string;
    authenticatorSelection?: Record<string, unknown>;
    excludeCredentials?: Array<{ type: string; id: string; transports?: string[] }>;
  };
};

type RequestOptions = {
  publicKey: {
    challenge: string;
    timeout?: number;
    rpId?: string;
    allowCredentials?: Array<{ type: string; id: string; transports?: string[] }>;
    userVerification?: string;
    hints?: string[];
  };
};

// base64url (RFC 4648 §5, unpadded) — matches the Go RawURLEncoding used by the
// go-webauthn protocol parser.
export function arrayBufferToBase64Url(buffer: ArrayBuffer): string {
  const bytes = new Uint8Array(buffer);
  let binary = "";
  for (const byte of bytes) {
    binary += String.fromCharCode(byte);
  }
  return btoa(binary).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
}

export function base64UrlToArrayBuffer(value: string): ArrayBuffer {
  const base64 = value.replace(/-/g, "+").replace(/_/g, "/");
  const padded = base64 + "=".repeat((4 - (base64.length % 4)) % 4);
  const binary = atob(padded);
  const bytes = new Uint8Array(binary.length);
  for (let i = 0; i < binary.length; i++) {
    bytes[i] = binary.charCodeAt(i);
  }
  return bytes.buffer;
}

export function isPasskeySupported(): boolean {
  return (
    typeof window !== "undefined" &&
    window.isSecureContext &&
    typeof window.PublicKeyCredential !== "undefined"
  );
}

function toCreationOptions(options: CreationOptions): PublicKeyCredentialCreationOptions {
  const publicKey = {
    ...options.publicKey,
    challenge: base64UrlToArrayBuffer(options.publicKey.challenge),
    user: {
      ...options.publicKey.user,
      id: base64UrlToArrayBuffer(options.publicKey.user.id),
    },
    excludeCredentials: (options.publicKey.excludeCredentials ?? []).map((credential) => ({
      ...credential,
      id: base64UrlToArrayBuffer(credential.id),
    })),
  };
  return publicKey as PublicKeyCredentialCreationOptions;
}

function toRequestOptions(options: RequestOptions): PublicKeyCredentialRequestOptions {
  const publicKey = {
    ...options.publicKey,
    challenge: base64UrlToArrayBuffer(options.publicKey.challenge),
    allowCredentials: (options.publicKey.allowCredentials ?? []).map((credential) => ({
      ...credential,
      id: base64UrlToArrayBuffer(credential.id),
    })),
  };
  return publicKey as PublicKeyCredentialRequestOptions;
}

function serializeCreationResponse(credential: PublicKeyCredential): Record<string, unknown> {
  const response = credential.response as AuthenticatorAttestationResponse;
  return {
    id: credential.id,
    rawId: arrayBufferToBase64Url(credential.rawId),
    type: credential.type,
    clientExtensionResults: credential.getClientExtensionResults() ?? {},
    response: {
      clientDataJSON: arrayBufferToBase64Url(response.clientDataJSON),
      attestationObject: arrayBufferToBase64Url(response.attestationObject),
      transports: typeof response.getTransports === "function" ? response.getTransports() : [],
    },
  };
}

function serializeAssertionResponse(credential: PublicKeyCredential): Record<string, unknown> {
  const response = credential.response as AuthenticatorAssertionResponse;
  return {
    id: credential.id,
    rawId: arrayBufferToBase64Url(credential.rawId),
    type: credential.type,
    clientExtensionResults: credential.getClientExtensionResults() ?? {},
    response: {
      clientDataJSON: arrayBufferToBase64Url(response.clientDataJSON),
      authenticatorData: arrayBufferToBase64Url(response.authenticatorData),
      signature: arrayBufferToBase64Url(response.signature),
      userHandle: response.userHandle ? arrayBufferToBase64Url(response.userHandle) : null,
    },
  };
}

// Login: begin a discoverable (usernameless) ceremony, prompt for a passkey,
// and complete the session server-side. Returns the logged-in user.
export async function loginWithPasskey(): Promise<{ user: any }> {
  const begin = await apiClient.post<{ data: RequestOptions }>("/auth/passkeys/login/begin");
  const credential = (await navigator.credentials.get({
    publicKey: toRequestOptions(begin.data.data),
  })) as PublicKeyCredential | null;
  if (!credential) {
    throw new Error("passkeys.canceled");
  }
  const complete = await apiClient.post<{ data: { user: any } }>(
    "/auth/passkeys/login/complete",
    serializeAssertionResponse(credential)
  );
  return complete.data.data;
}

// Registration: begin an authenticated ceremony, prompt for a passkey, and
// store the new credential. Returns the created passkey entry.
export async function registerPasskey(): Promise<Passkey> {
  const begin = await apiClient.post<{ data: CreationOptions }>("/auth/passkeys/register/begin");
  const credential = (await navigator.credentials.create({
    publicKey: toCreationOptions(begin.data.data),
  })) as PublicKeyCredential | null;
  if (!credential) {
    throw new Error("passkeys.canceled");
  }
  const complete = await apiClient.post<{ data: Passkey }>(
    "/auth/passkeys/register/complete",
    serializeCreationResponse(credential)
  );
  return complete.data.data;
}

export async function listPasskeys(): Promise<Passkey[]> {
  const res = await apiClient.get<{ data: Passkey[] }>("/auth/passkeys");
  return res.data.data ?? [];
}

export async function deletePasskey(id: number) {
  await apiClient.delete(`/auth/passkeys/${id}`);
}

export async function renamePasskey(id: number, name: string) {
  await apiClient.patch(`/auth/passkeys/${id}`, { name });
}
