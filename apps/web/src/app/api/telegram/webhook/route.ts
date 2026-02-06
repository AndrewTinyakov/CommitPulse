import { ConvexHttpClient } from "convex/browser";
import { api } from "@convex/_generated/api";

const TELEGRAM_API_BASE = "https://api.telegram.org";

function getConvexClient() {
  const url = process.env.CONVEX_URL ?? process.env.NEXT_PUBLIC_CONVEX_URL;
  if (!url) {
    throw new Error("Missing CONVEX_URL");
  }
  return new ConvexHttpClient(url);
}

function getBotToken() {
  const token = process.env.TELEGRAM_BOT_TOKEN;
  if (!token) {
    throw new Error("Missing TELEGRAM_BOT_TOKEN");
  }
  return token;
}

function getWebhookSecret() {
  const secret = process.env.TELEGRAM_WEBHOOK_SECRET;
  if (!secret) {
    throw new Error("Missing TELEGRAM_WEBHOOK_SECRET");
  }
  return secret;
}

async function telegramApi(method: string, payload: Record<string, unknown>) {
  const token = getBotToken();
  const response = await fetch(`${TELEGRAM_API_BASE}/bot${token}/${method}`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(payload),
  });
  if (!response.ok) {
    const body = await response.text();
    throw new Error(`Telegram API error ${response.status}: ${body}`);
  }
}

function parseStartPayload(text: string) {
  const [command, payload] = text.trim().split(" ");
  if (!command?.startsWith("/start")) return null;
  return payload ?? null;
}

export async function POST(request: Request) {
  const secret = getWebhookSecret();
  const header = request.headers.get("x-telegram-bot-api-secret-token");
  if (header !== secret) {
    return new Response("Unauthorized", { status: 401 });
  }

  const update = (await request.json()) as {
    message?: {
      text?: string;
      chat?: { id: number | string };
      from?: {
        id: number | string;
        username?: string;
        first_name?: string;
        last_name?: string;
      };
    };
    callback_query?: {
      id: string;
      data?: string;
      from?: {
        id: number | string;
        username?: string;
        first_name?: string;
        last_name?: string;
      };
      message?: {
        chat?: { id: number | string };
      };
    };
  };

  const convex = getConvexClient();

  if (update.message?.text?.startsWith("/start")) {
    const payload = parseStartPayload(update.message.text ?? "");
    const chatId = update.message.chat?.id?.toString();
    const from = update.message.from;
    const telegramUserId = from?.id?.toString();

    if (!payload || !chatId || !telegramUserId) {
      if (chatId) {
        await telegramApi("sendMessage", {
          chat_id: chatId,
          text: "Missing login token. Please start again from the site.",
        });
      }
      return Response.json({ ok: true });
    }

    const startResult = await convex.mutation(api.telegramAuth.startLoginSession, {
      token: payload,
      telegramUserId,
      chatId,
      telegramUsername: from?.username ?? null,
      telegramFirstName: from?.first_name ?? null,
      telegramLastName: from?.last_name ?? null,
    });

    if (!startResult.ok) {
      await telegramApi("sendMessage", {
        chat_id: chatId,
        text: "That login link has expired. Please start again from the site.",
      });
      return Response.json({ ok: true });
    }

    await telegramApi("sendMessage", {
      chat_id: chatId,
      text: "Tap confirm to finish connecting your account.",
      reply_markup: {
        inline_keyboard: [[{ text: "Confirm login", callback_data: `confirm:${payload}` }]],
      },
    });

    return Response.json({ ok: true });
  }

  if (update.callback_query?.data?.startsWith("confirm:")) {
    const chatId = update.callback_query.message?.chat?.id?.toString();
    const from = update.callback_query.from;
    const telegramUserId = from?.id?.toString();
    const token = update.callback_query.data.slice("confirm:".length);

    if (!token || !telegramUserId || !chatId) {
      if (chatId) {
        await telegramApi("sendMessage", {
          chat_id: chatId,
          text: "Missing login token. Please start again from the site.",
        });
      }
      return Response.json({ ok: true });
    }

    const confirmResult = await convex.mutation(api.telegramAuth.confirmLoginSession, {
      token,
      telegramUserId,
      chatId,
      telegramUsername: from?.username ?? null,
      telegramFirstName: from?.first_name ?? null,
      telegramLastName: from?.last_name ?? null,
    });

    if (!confirmResult.ok) {
      const message =
        confirmResult.errorCode === "ALREADY_LINKED"
          ? "This Telegram account is already linked to another user."
          : "Could not confirm login. Please try again from the site.";
      if (chatId) {
        await telegramApi("sendMessage", {
          chat_id: chatId,
          text: message,
        });
      }
    } else if (chatId) {
      await telegramApi("sendMessage", {
        chat_id: chatId,
        text: "Confirmed. You can return to the site now.",
      });
    }

    await telegramApi("answerCallbackQuery", {
      callback_query_id: update.callback_query.id,
      text: "Confirmed",
      show_alert: false,
    });

    return Response.json({ ok: true });
  }

  return Response.json({ ok: true });
}
