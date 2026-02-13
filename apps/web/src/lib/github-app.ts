import { createHmac, createSign, randomUUID, timingSafeEqual } from "crypto";

const GITHUB_API = "https://api.github.com";

type GithubAppStatePayload = {
  userId: string;
  nonce: string;
  exp: number;
};

function base64Url(input: string | Buffer) {
  return Buffer.from(input)
    .toString("base64")
    .replace(/=/g, "")
    .replace(/\+/g, "-")
    .replace(/\//g, "_");
}

function fromBase64Url(input: string) {
  const normalized = input.replace(/-/g, "+").replace(/_/g, "/");
  const padded = normalized.padEnd(Math.ceil(normalized.length / 4) * 4, "=");
  return Buffer.from(padded, "base64");
}

function required(name: string) {
  const value = process.env[name];
  if (!value) throw new Error(`Missing ${name}`);
  return value;
}

function stateSecret() {
  return process.env.GITHUB_APP_STATE_SECRET ?? required("GITHUB_APP_CLIENT_SECRET");
}

export function createSignedState(userId: string) {
  const payload: GithubAppStatePayload = {
    userId,
    nonce: randomUUID(),
    exp: Date.now() + 10 * 60 * 1000,
  };

  const encodedPayload = base64Url(JSON.stringify(payload));
  const signature = createHmac("sha256", stateSecret()).update(encodedPayload).digest();
  const encodedSignature = base64Url(signature);

  return `${encodedPayload}.${encodedSignature}`;
}

export function verifySignedState(state: string) {
  const [encodedPayload, encodedSignature] = state.split(".");
  if (!encodedPayload || !encodedSignature) {
    throw new Error("Invalid state format");
  }

  const expected = createHmac("sha256", stateSecret()).update(encodedPayload).digest();
  const actual = fromBase64Url(encodedSignature);
  if (expected.length !== actual.length || !timingSafeEqual(expected, actual)) {
    throw new Error("Invalid state signature");
  }

  const payload = JSON.parse(fromBase64Url(encodedPayload).toString("utf8")) as GithubAppStatePayload;
  if (payload.exp < Date.now()) {
    throw new Error("State expired");
  }

  return payload;
}

export function githubAppInstallUrl(state: string) {
  const appSlug = required("GITHUB_APP_SLUG");
  const url = new URL(`https://github.com/apps/${appSlug}/installations/new`);
  url.searchParams.set("state", state);
  return url.toString();
}

function githubAppJwt() {
  const appId = required("GITHUB_APP_ID");
  const privateKeyRaw = required("GITHUB_APP_PRIVATE_KEY");
  const privateKey = privateKeyRaw.includes("\\n") ? privateKeyRaw.replace(/\\n/g, "\n") : privateKeyRaw;
  const nowSec = Math.floor(Date.now() / 1000);

  const header = { alg: "RS256", typ: "JWT" };
  const payload = {
    iat: nowSec - 60,
    exp: nowSec + 9 * 60,
    iss: appId,
  };

  const encodedHeader = base64Url(JSON.stringify(header));
  const encodedPayload = base64Url(JSON.stringify(payload));
  const signingInput = `${encodedHeader}.${encodedPayload}`;

  const signer = createSign("RSA-SHA256");
  signer.update(signingInput);
  signer.end();
  const signature = signer.sign(privateKey);

  return `${signingInput}.${base64Url(signature)}`;
}

async function githubRequest<T>(token: string, url: string, init: RequestInit = {}) {
  const response = await fetch(url, {
    ...init,
    headers: {
      Authorization: `Bearer ${token}`,
      "User-Agent": "commit-tracker",
      Accept: "application/vnd.github+json",
      "X-GitHub-Api-Version": "2022-11-28",
      ...(init.headers ?? {}),
    },
  });

  if (!response.ok) {
    throw new Error(`GitHub API error (${response.status}): ${await response.text()}`);
  }

  return (await response.json()) as T;
}

export async function fetchInstallation(installationId: number) {
  const token = githubAppJwt();
  return await githubRequest<{
    id: number;
    account?: { login?: string; type?: "User" | "Organization" };
    repository_selection?: "all" | "selected";
  }>(token, `${GITHUB_API}/app/installations/${installationId}`);
}

export function verifyWebhookSignature(rawBody: string, signatureHeader: string | null) {
  const secret = required("GITHUB_APP_WEBHOOK_SECRET");
  if (!signatureHeader || !signatureHeader.startsWith("sha256=")) {
    return false;
  }

  const expected = createHmac("sha256", secret).update(rawBody).digest("hex");
  const actual = signatureHeader.slice("sha256=".length);

  const expectedBuffer = Buffer.from(expected, "utf8");
  const actualBuffer = Buffer.from(actual, "utf8");
  if (expectedBuffer.length !== actualBuffer.length) return false;
  return timingSafeEqual(expectedBuffer, actualBuffer);
}

export function webhookForwardSecret() {
  return required("GITHUB_APP_WEBHOOK_SECRET");
}
