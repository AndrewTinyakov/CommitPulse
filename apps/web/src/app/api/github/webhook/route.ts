import { ConvexHttpClient } from "convex/browser";
import { api } from "@convex/_generated/api";
import { verifyWebhookSignature, webhookForwardSecret } from "@/lib/github-app";

function convexClient() {
  const url = process.env.CONVEX_URL ?? process.env.NEXT_PUBLIC_CONVEX_URL;
  if (!url) throw new Error("Missing CONVEX_URL");
  return new ConvexHttpClient(url);
}

export async function POST(request: Request) {
  const deliveryId = request.headers.get("x-github-delivery");
  const event = request.headers.get("x-github-event");
  const signature = request.headers.get("x-hub-signature-256");
  const rawBody = await request.text();

  if (!deliveryId || !event) {
    return new Response("Missing webhook headers", { status: 400 });
  }

  if (!verifyWebhookSignature(rawBody, signature)) {
    return new Response("Invalid signature", { status: 401 });
  }

  const payload = JSON.parse(rawBody) as {
    installation?: { id?: number };
    repository?: { full_name?: string };
    action?: string;
  };

  const installationId = payload.installation?.id;
  const repoFullName = payload.repository?.full_name;

  try {
    const convex = convexClient();
    await convex.mutation(api.github.ingestWebhookEvent, {
      secret: webhookForwardSecret(),
      deliveryId,
      event,
      installationId: typeof installationId === "number" ? installationId : undefined,
      repoFullName,
      setupAction: payload.action,
    });
    await convex.action(api.github.triggerSyncWorker, {
      secret: webhookForwardSecret(),
    });
    return Response.json({ ok: true });
  } catch (error) {
    console.error("Failed to ingest GitHub webhook", error);
    return new Response("Webhook ingestion failed", { status: 500 });
  }
}
