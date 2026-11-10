// Server-only lead delivery. No contact data is persisted in D1 or application logs.
export const generatorNames = ["Помогите выбрать исполнение", "В кожухе", "В контейнере", "На шасси"];
const utmKeys = ["utm_source", "utm_medium", "utm_campaign", "utm_content", "utm_term", "yclid", "gclid"];
const clean = v => typeof v === "string" ? v.replace(/[\u0000-\u0008\u000b\u000c\u000e-\u001f\u007f]/g, "").trim() : "";
const reply = (status, message, extra = {}) => Response.json({ ok: status === 200, message, ...extra }, { status, headers: { "Cache-Control": "no-store", "X-Content-Type-Options": "nosniff" } });

function safeUrl(value, max, keepUtm = false) {
  try {
    const u = new URL(clean(value));
    if (!["https:", "http:"].includes(u.protocol)) return "";
    const params = new URLSearchParams();
    if (keepUtm) for (const k of utmKeys) if (u.searchParams.has(k)) params.set(k, u.searchParams.get(k).slice(0, 80));
    u.username = ""; u.password = ""; u.search = params.toString(); u.hash = "";
    return u.href.slice(0, max);
  } catch { return ""; }
}

export function validateLead(raw, now = Date.now()) {
  if (!raw || typeof raw !== "object" || Array.isArray(raw)) throw new Error("Некорректная заявка.");
  if (clean(raw.website)) throw new Error("Не удалось проверить заявку.");
  if (raw.consent !== true) throw new Error("Подтвердите согласие на обработку персональных данных.");
  if (!Number.isFinite(raw.startedAt) || now - raw.startedAt < 1500 || now - raw.startedAt > 86400000) throw new Error("Обновите страницу и повторите отправку.");
  if (typeof raw.requestId !== "string" || !/^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(raw.requestId)) throw new Error("Обновите страницу и повторите отправку.");
  const contact = clean(raw.contact), name = clean(raw.name), task = clean(raw.task);
  if (contact.length > 160 || name.length > 120 || task.length > 1000) throw new Error("Сократите текст заявки.");
  const phone = /^\+?[\d ()-]+$/.test(contact) && contact.replace(/\D/g, "").length >= 10 && contact.replace(/\D/g, "").length <= 15;
  const valid = raw.method === "phone" ? phone : raw.method === "email" ? /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(contact) : raw.method === "telegram" ? phone || /^@[A-Za-z0-9_]{5,32}$/.test(contact) : false;
  if (!valid) throw new Error("Проверьте контакт для связи.");
  if (!generatorNames.includes(raw.generator)) throw new Error("Выберите исполнение генератора.");
  const utm = {};
  if (raw.utm && typeof raw.utm === "object") for (const k of utmKeys) { const v = clean(raw.utm[k]); if (v) utm[k] = v.slice(0, 80); }
  return { contact, name, task, method: raw.method, generator: raw.generator, requestId: raw.requestId.toLowerCase(), page: safeUrl(raw.page, 400, true), referrer: safeUrl(raw.referrer, 250), utm };
}

async function hash(value) {
  return Array.from(new Uint8Array(await crypto.subtle.digest("SHA-256", new TextEncoder().encode(value))), n => n.toString(16).padStart(2, "0")).join("");
}

async function readBounded(request) {
  if (Number(request.headers.get("content-length") || 0) > 12000) throw new Error("BODY_TOO_LARGE");
  if (!request.body) throw new Error("INVALID_JSON");
  const reader = request.body.getReader(), chunks = [];
  let length = 0;
  while (true) {
    const { done, value } = await reader.read(); if (done) break;
    length += value.length;
    if (length > 12000) { await reader.cancel(); throw new Error("BODY_TOO_LARGE"); }
    chunks.push(value);
  }
  const bytes = new Uint8Array(length); let offset = 0;
  for (const c of chunks) { bytes.set(c, offset); offset += c.length; }
  try { return JSON.parse(new TextDecoder().decode(bytes)); } catch { throw new Error("INVALID_JSON"); }
}

function existingResponse(row, fingerprint) {
  if (row.fingerprint !== fingerprint) return reply(409, "Данные заявки изменились. Обновите страницу перед повторной отправкой.");
  if (row.status === "sent") return reply(200, "Заявка уже доставлена.", { duplicate: true });
  if (row.status === "rejected") return reply(502, "Сейчас не удалось отправить заявку. Попробуйте через минуту или позвоните нам.");
  return reply(409, "Предыдущая отправка ещё не подтверждена. Попробуйте позже или свяжитесь с нами по телефону.");
}

export function telegramText(lead, now) {
  const method = { phone: "Телефон", email: "Почта", telegram: "Telegram" }[lead.method];
  return ["ЗАЯВКА ENERGY", `Контакт (${method}): ${lead.contact}`, `Имя / компания: ${lead.name || "Не указано"}`, `Исполнение: ${lead.generator}`, `Задача: ${lead.task || "Уточнить при обращении"}`, "", `Страница: ${lead.page || "Не указана"}`, `Источник перехода: ${lead.referrer || "Прямой / не определён"}`, ...Object.entries(lead.utm).map(([k,v]) => `${k}: ${v}`), "", `Согласие на обработку: получено, ${new Date(now).toISOString()}`, "Документ: https://generator-energy.ru/policy/", `ID заявки: ${lead.requestId}`].join("\n").slice(0, 3900);
}

export async function handleLead(request, env, options = {}) {
  const now = options.now ?? Date.now(), fetchImpl = options.fetchImpl ?? fetch;
  if (request.method !== "POST") return reply(405, "Метод не поддерживается.");
  const origin = request.headers.get("origin");
  if (!origin || origin !== new URL(request.url).origin || request.headers.get("sec-fetch-site") === "cross-site") return reply(403, "Отправьте заявку через форму на сайте.");
  if (!request.headers.get("content-type")?.toLowerCase().includes("application/json")) return reply(415, "Некорректный формат заявки.");
  let lead;
  try { lead = validateLead(await readBounded(request), now); }
  catch (e) { return reply(e.message === "BODY_TOO_LARGE" ? 413 : 400, e.message === "BODY_TOO_LARGE" ? "Сократите текст заявки." : e.message === "INVALID_JSON" ? "Некорректная заявка." : e.message); }
  if (!env.TELEGRAM_BOT_TOKEN || !env.TELEGRAM_CHAT_ID) return reply(503, "Сейчас не удалось отправить заявку. Позвоните нам: +7 (967) 246-26-56.");
  if (!env.DB) return reply(503, "Сейчас не удалось отправить заявку. Попробуйте позже или позвоните нам.");
  const db = env.DB;
  let id, fingerprint;
  try {
    const salt = env.LEAD_HASH_SALT || env.TELEGRAM_BOT_TOKEN;
    const canonicalContact = lead.method === "phone" || !lead.contact.startsWith("@") && lead.method === "telegram" ? lead.contact.replace(/\D/g, "").replace(/^8(?=\d{10}$)/, "7") : lead.contact.toLowerCase();
    [id, fingerprint] = await Promise.all([hash(salt + lead.requestId), hash(salt + [canonicalContact, lead.generator, lead.task.toLowerCase()].join("|"))]);
    const ip = request.headers.get("cf-connecting-ip") || "local-preview";
    const ipHash = await hash(salt + "ip:" + ip);
    await db.prepare("DELETE FROM lead_delivery WHERE expires_at < ?").bind(now).run();
    let existing = await db.prepare("SELECT fingerprint,status FROM lead_delivery WHERE id = ? OR fingerprint = ? LIMIT 1").bind(id, fingerprint).first();
    if (existing) return existingResponse(existing, fingerprint);
    // The INSERT and the rate-limit condition execute as one atomic SQLite statement.
    const result = await db.prepare("INSERT OR IGNORE INTO lead_delivery (id,fingerprint,ip_hash,status,created_at,expires_at) SELECT ?,?,?, 'pending',?,? WHERE (SELECT COUNT(*) FROM lead_delivery WHERE ip_hash = ? AND created_at > ?) < 4").bind(id, fingerprint, ipHash, now, now + 600000, ipHash, now - 60000).run();
    if (!result.meta?.changes) {
      existing = await db.prepare("SELECT fingerprint,status FROM lead_delivery WHERE id = ? OR fingerprint = ? LIMIT 1").bind(id, fingerprint).first();
      return existing ? existingResponse(existing, fingerprint) : reply(429, "Слишком много отправок. Подождите минуту или свяжитесь с нами по телефону.");
    }
  } catch { return reply(503, "Сейчас не удалось отправить заявку. Попробуйте позже или позвоните нам."); }

  try {
    const body = { chat_id: env.TELEGRAM_CHAT_ID, text: telegramText(lead, now), link_preview_options: { is_disabled: true } };
    if (/^[1-9]\d*$/.test(env.TELEGRAM_MESSAGE_THREAD_ID || "")) body.message_thread_id = Number(env.TELEGRAM_MESSAGE_THREAD_ID);
    const response = await fetchImpl(`https://api.telegram.org/bot${env.TELEGRAM_BOT_TOKEN}/sendMessage`, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body), signal: AbortSignal.timeout(10000) });
    const data = await response.json();
    if (!response.ok || data.ok !== true || !Number.isInteger(data.result?.message_id)) {
      await db.prepare("UPDATE lead_delivery SET status='rejected',expires_at=? WHERE id=?").bind(now + 60000, id).run();
      return reply(502, "Сейчас не удалось отправить заявку. Попробуйте через минуту или позвоните нам.");
    }
    // Delivery is confirmed even if persisting the final marker fails; the pending marker still prevents retries.
    try { await db.prepare("UPDATE lead_delivery SET status='sent' WHERE id=?").bind(id).run(); } catch { /* no private data in logs */ }
    return reply(200, "Заявка доставлена.");
  } catch {
    // A timeout is ambiguous: never retry Telegram automatically and never show success.
    try { await db.prepare("UPDATE lead_delivery SET status='uncertain' WHERE id=?").bind(id).run(); } catch { /* reservation remains pending */ }
    return reply(502, "Не удалось подтвердить доставку заявки. Попробуйте позже или свяжитесь с нами по телефону.");
  }
}
