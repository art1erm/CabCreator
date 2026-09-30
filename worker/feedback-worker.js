/**
 * CabCreator feedback relay — Cloudflare Worker.
 *
 * Receives a bug report or suggestion from the app (POST JSON) and forwards it
 * to a Telegram chat through the Bot API. The bot token lives only here, as a
 * secret, never in the web page.
 *
 * Secrets / variables (see worker/README.md):
 *   BOT_TOKEN     — token from @BotFather (secret)
 *   CHAT_ID       — chat that receives the messages (secret or var)
 *   ALLOW_ORIGIN  — optional, e.g. "https://av0cad01.github.io"; "*" by default
 */

const MAX_MSG = 3000;           // characters of user text
const MAX_PROJECT = 200_000;    // bytes of attached project JSON
const WINDOW_MS = 60_000;       // simple per-IP rate limit: 5 messages a minute
const LIMIT = 5;
const hits = new Map();

export default {
  async fetch(req, env) {
    const cors = {
      "Access-Control-Allow-Origin": env.ALLOW_ORIGIN || "*",
      "Access-Control-Allow-Methods": "POST, OPTIONS",
      "Access-Control-Allow-Headers": "Content-Type",
      "Access-Control-Max-Age": "86400",
    };
    const reply = (status, obj) =>
      new Response(JSON.stringify(obj), { status, headers: { ...cors, "Content-Type": "application/json" } });

    if (req.method === "OPTIONS") return new Response(null, { status: 204, headers: cors });
    if (req.method !== "POST") return reply(405, { ok: false, error: "method" });
    if (!env.BOT_TOKEN || !env.CHAT_ID) return reply(500, { ok: false, error: "not_configured" });

    // rate limit per client IP (best effort, per worker instance)
    const ip = req.headers.get("CF-Connecting-IP") || "?";
    const now = Date.now();
    const recent = (hits.get(ip) || []).filter((t) => now - t < WINDOW_MS);
    if (recent.length >= LIMIT) return reply(429, { ok: false, error: "rate_limited" });
    recent.push(now);
    hits.set(ip, recent);

    let d;
    try {
      d = await req.json();
    } catch {
      return reply(400, { ok: false, error: "bad_json" });
    }
    if (d.website) return reply(200, { ok: true }); // honeypot filled in by a bot

    const message = String(d.message || "").trim().slice(0, MAX_MSG);
    if (message.length < 10) return reply(400, { ok: false, error: "too_short" });

    const kind = d.kind === "idea" ? "💡 Предложение" : "🐞 Ошибка";
    const contact = String(d.contact || "").trim().slice(0, 120);
    const context = String(d.context || "").trim().slice(0, 400);
    const version = String(d.version || "").slice(0, 20);

    const text = [
      `${kind} · CabCreator ${version}`,
      "",
      message,
      "",
      contact ? `Контакт: ${contact}` : "Контакт: не указан",
      context ? `Контекст: ${context}` : "",
    ]
      .filter((l, i, a) => l !== "" || (a[i - 1] !== "" && i < a.length - 1))
      .join("\n")
      .slice(0, 4000);

    const api = `https://api.telegram.org/bot${env.BOT_TOKEN}`;
    const sent = await fetch(`${api}/sendMessage`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ chat_id: env.CHAT_ID, text, disable_web_page_preview: true }),
    });
    if (!sent.ok) return reply(502, { ok: false, error: "telegram" });

    // attach the project as a file so the report can be reproduced
    const project = typeof d.project === "string" ? d.project : "";
    if (project && project.length <= MAX_PROJECT) {
      const form = new FormData();
      form.append("chat_id", env.CHAT_ID);
      form.append("document", new Blob([project], { type: "application/json" }), "project.json");
      form.append("caption", "Проект к сообщению выше — откройте его в CabCreator кнопкой «Открыть»");
      await fetch(`${api}/sendDocument`, { method: "POST", body: form });
    }

    return reply(200, { ok: true });
  },
};
