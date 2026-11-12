<?php
declare(strict_types=1);

namespace Energy\Timeweb;

const GENERATORS = ['Помогите выбрать исполнение', 'В кожухе', 'В контейнере', 'На шасси'];
const UTM_KEYS = ['utm_source', 'utm_medium', 'utm_campaign', 'utm_content', 'utm_term', 'yclid', 'gclid'];
const UNAVAILABLE = 'Сейчас не удалось отправить заявку. Позвоните нам: +7 (967) 246-26-56.';

/** Minimal dotenv reader: only the four documented secret variables, no evaluation/expansion. */
function readEnvironmentFile(string $file): array
{
    if (!is_file($file)) return [];
    $contents = file_get_contents($file, false, null, 0, 8193);
    if ($contents === false || strlen($contents) > 8192) throw new \RuntimeException('Environment unavailable');
    $values = [];
    foreach (preg_split('/\r\n|\n|\r/', $contents) as $line) {
        $line = trim($line);
        if ($line === '' || str_starts_with($line, '#')) continue;
        if (!preg_match('/^(TELEGRAM_BOT_TOKEN|TELEGRAM_CHAT_ID|TELEGRAM_MESSAGE_THREAD_ID|LEAD_HASH_SALT)\s*=\s*(.*)$/D', $line, $match)) continue;
        $value = trim($match[2]);
        if ($value !== '' && ($value[0] === '"' || $value[0] === "'")) {
            if (strlen($value) < 2 || substr($value, -1) !== $value[0]) throw new \RuntimeException('Environment unavailable');
            $value = substr($value, 1, -1);
        }
        if (preg_match('/[\x00-\x1F\x7F]/', $value)) throw new \RuntimeException('Environment unavailable');
        $values[$match[1]] = $value;
    }
    return $values;
}

function reply(int $status, string $message, array $extra = []): array
{
    return ['status' => $status, 'body' => array_merge(['ok' => $status === 200, 'message' => $message], $extra)];
}

function clean(mixed $value): string
{
    return is_string($value) ? trim(preg_replace('/[\x00-\x08\x0B\x0C\x0E-\x1F\x7F]/u', '', $value) ?? '') : '';
}

function safeUrl(mixed $value, int $limit, bool $keepUtm = false): string
{
    $url = parse_url(clean($value));
    if ($url === false || !in_array(strtolower($url['scheme'] ?? ''), ['http', 'https'], true) || empty($url['host'])) return '';
    $host = strtolower($url['host']);
    if (preg_match('/[\s\\\\<>"\x00-\x1F]/u', $host)) return '';
    $result = strtolower($url['scheme']) . '://' . $host;
    if (isset($url['port'])) $result .= ':' . $url['port'];
    $result .= $url['path'] ?? '/';
    if ($keepUtm && !empty($url['query'])) {
        parse_str($url['query'], $params);
        $safe = [];
        foreach (UTM_KEYS as $key) {
            $v = clean($params[$key] ?? null);
            if ($v !== '') $safe[$key] = mb_substr($v, 0, 80);
        }
        if ($safe) $result .= '?' . http_build_query($safe, '', '&', PHP_QUERY_RFC3986);
    }
    return mb_substr($result, 0, $limit);
}

function validateLead(mixed $raw, int $now): array
{
    if (!is_array($raw) || array_is_list($raw)) throw new \InvalidArgumentException('Некорректная заявка.');
    if (clean($raw['website'] ?? null) !== '') throw new \InvalidArgumentException('Не удалось проверить заявку.');
    if (($raw['consent'] ?? null) !== true) throw new \InvalidArgumentException('Подтвердите согласие на обработку персональных данных.');
    $started = $raw['startedAt'] ?? null;
    if ((!is_int($started) && !is_float($started)) || !is_finite((float)$started) || $now - $started < 1500 || $now - $started > 86400000) {
        throw new \InvalidArgumentException('Обновите страницу и повторите отправку.');
    }
    $requestId = $raw['requestId'] ?? null;
    if (!is_string($requestId) || !preg_match('/^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/iD', $requestId)) {
        throw new \InvalidArgumentException('Обновите страницу и повторите отправку.');
    }
    $contact = clean($raw['contact'] ?? null);
    $name = clean($raw['name'] ?? null);
    $task = clean($raw['task'] ?? null);
    if (mb_strlen($contact) > 160 || mb_strlen($name) > 120 || mb_strlen($task) > 1000) throw new \InvalidArgumentException('Сократите текст заявки.');
    $digits = preg_replace('/\D/', '', $contact);
    $phone = preg_match('/^\+?[\d ()-]+$/D', $contact) && strlen($digits) >= 10 && strlen($digits) <= 15;
    $method = $raw['method'] ?? null;
    $valid = match ($method) {
        'phone' => (bool)$phone,
        'email' => (bool)preg_match('/^[^\s@]+@[^\s@]+\.[^\s@]+$/uD', $contact),
        'telegram' => $phone || (bool)preg_match('/^@[A-Za-z0-9_]{5,32}$/D', $contact),
        default => false,
    };
    if (!$valid) throw new \InvalidArgumentException('Проверьте контакт для связи.');
    if (!in_array($raw['generator'] ?? null, GENERATORS, true)) throw new \InvalidArgumentException('Выберите исполнение генератора.');
    $utm = [];
    foreach (UTM_KEYS as $key) {
        $v = clean(is_array($raw['utm'] ?? null) ? ($raw['utm'][$key] ?? null) : null);
        if ($v !== '') $utm[$key] = mb_substr($v, 0, 80);
    }
    return [
        'contact' => $contact, 'name' => $name, 'task' => $task, 'method' => $method,
        'generator' => $raw['generator'], 'requestId' => strtolower($requestId),
        'page' => safeUrl($raw['page'] ?? null, 400, true),
        'referrer' => safeUrl($raw['referrer'] ?? null, 250), 'utm' => $utm,
    ];
}

function telegramText(array $lead, int $now): string
{
    $method = ['phone' => 'Телефон', 'email' => 'Почта', 'telegram' => 'Telegram'][$lead['method']];
    $lines = [
        'ЗАЯВКА ENERGY', 'Контакт (' . $method . '): ' . $lead['contact'],
        'Имя / компания: ' . ($lead['name'] ?: 'Не указано'), 'Исполнение: ' . $lead['generator'],
        'Задача: ' . ($lead['task'] ?: 'Уточнить при обращении'), '',
        'Страница: ' . ($lead['page'] ?: 'Не указана'),
        'Источник перехода: ' . ($lead['referrer'] ?: 'Прямой / не определён'),
    ];
    foreach ($lead['utm'] as $key => $value) $lines[] = $key . ': ' . $value;
    array_push($lines, '', 'Согласие на обработку: получено, ' . gmdate('Y-m-d\TH:i:s\Z', intdiv($now, 1000)),
        'Документ: https://generator-energy.ru/policy/', 'ID заявки: ' . $lead['requestId']);
    return mb_substr(implode("\n", $lines), 0, 3900);
}

function openDatabase(string $directory): \PDO
{
    if ($directory === '' || (!is_dir($directory) && !mkdir($directory, 0700, true) && !is_dir($directory))) throw new \RuntimeException('Storage unavailable');
    $real = realpath($directory);
    $documentRoot = isset($_SERVER['DOCUMENT_ROOT']) ? realpath($_SERVER['DOCUMENT_ROOT']) : false;
    if ($real === false || ($documentRoot !== false && str_starts_with($real . DIRECTORY_SEPARATOR, $documentRoot . DIRECTORY_SEPARATOR))) {
        throw new \RuntimeException('Storage must be private');
    }
    $file = $real . '/leads.sqlite';
    $db = new \PDO('sqlite:' . $file, null, null, [\PDO::ATTR_ERRMODE => \PDO::ERRMODE_EXCEPTION]);
    chmod($file, 0600);
    $db->exec('PRAGMA busy_timeout=5000');
    $db->exec("CREATE TABLE IF NOT EXISTS lead_delivery (
        id TEXT PRIMARY KEY, fingerprint TEXT NOT NULL UNIQUE, ip_hash TEXT NOT NULL,
        status TEXT NOT NULL, created_at INTEGER NOT NULL, expires_at INTEGER NOT NULL)");
    $db->exec('CREATE INDEX IF NOT EXISTS lead_delivery_ip ON lead_delivery(ip_hash,created_at)');
    $db->exec('CREATE INDEX IF NOT EXISTS lead_delivery_expiry ON lead_delivery(expires_at)');
    return $db;
}

function existingResponse(array $row, string $fingerprint): array
{
    if (!hash_equals($row['fingerprint'], $fingerprint)) return reply(409, 'Данные заявки изменились. Обновите страницу перед повторной отправкой.');
    if ($row['status'] === 'sent') return reply(200, 'Заявка уже доставлена.', ['duplicate' => true]);
    if ($row['status'] === 'rejected') return reply(502, 'Сейчас не удалось отправить заявку. Попробуйте через минуту или позвоните нам.');
    return reply(409, 'Предыдущая отправка ещё не подтверждена. Попробуйте позже или свяжитесь с нами по телефону.');
}

function findExisting(\PDO $db, string $id, string $fingerprint): array|false
{
    $statement = $db->prepare('SELECT fingerprint,status FROM lead_delivery WHERE id=? OR fingerprint=? LIMIT 1');
    $statement->execute([$id, $fingerprint]);
    return $statement->fetch(\PDO::FETCH_ASSOC);
}

/** Production transport. Tests replace this callable; no messages are sent by tests. */
function sendTelegram(array $config, array $payload): array
{
    $curl = curl_init('https://api.telegram.org/bot' . $config['telegram_bot_token'] . '/sendMessage');
    if ($curl === false) throw new \RuntimeException('Transport unavailable');
    try {
        curl_setopt_array($curl, [
            CURLOPT_POST => true, CURLOPT_HTTPHEADER => ['Content-Type: application/json'],
            CURLOPT_POSTFIELDS => json_encode($payload, JSON_UNESCAPED_UNICODE | JSON_THROW_ON_ERROR),
            CURLOPT_RETURNTRANSFER => true, CURLOPT_FOLLOWLOCATION => false,
            CURLOPT_PROTOCOLS => CURLPROTO_HTTPS,
            CURLOPT_SSL_VERIFYPEER => true, CURLOPT_SSL_VERIFYHOST => 2,
            CURLOPT_CONNECTTIMEOUT => 3, CURLOPT_TIMEOUT => 10,
        ]);
        $body = curl_exec($curl);
        if ($body === false) throw new \RuntimeException('Delivery uncertain');
        return ['status' => (int)curl_getinfo($curl, CURLINFO_HTTP_CODE), 'data' => json_decode($body, true, 512, JSON_THROW_ON_ERROR)];
    } finally { curl_close($curl); }
}

function handleLead(array $server, string $body, array $config, ?callable $transport = null, ?int $now = null): array
{
    $now ??= (int)floor(microtime(true) * 1000);
    if (($server['REQUEST_METHOD'] ?? '') !== 'POST') return reply(405, 'Метод не поддерживается.');
    $origins = array_merge([$config['site_origin'] ?? 'https://top-generator.ru'], $config['additional_origins'] ?? []);
    if (!in_array($server['HTTP_ORIGIN'] ?? '', $origins, true) || ($server['HTTP_SEC_FETCH_SITE'] ?? '') === 'cross-site') {
        return reply(403, 'Отправьте заявку через форму на сайте.');
    }
    if (strtolower(trim(explode(';', $server['CONTENT_TYPE'] ?? '')[0])) !== 'application/json') return reply(415, 'Некорректный формат заявки.');
    if (strlen($body) > 12000 || (int)($server['CONTENT_LENGTH'] ?? 0) > 12000) return reply(413, 'Сократите текст заявки.');
    try { $raw = json_decode($body, true, 512, JSON_THROW_ON_ERROR); }
    catch (\JsonException $error) { return reply(400, 'Некорректная заявка.'); }
    try { $lead = validateLead($raw, $now); }
    catch (\InvalidArgumentException $error) { return reply(400, $error->getMessage()); }

    if (!extension_loaded('pdo_sqlite') || !extension_loaded('mbstring') || ($transport === null && !extension_loaded('curl')) ||
        !is_string($config['telegram_bot_token'] ?? null) || $config['telegram_bot_token'] === '' ||
        !is_string($config['telegram_chat_id'] ?? null) || $config['telegram_chat_id'] === '') return reply(503, UNAVAILABLE);
    try {
        $db = openDatabase((string)($config['storage_path'] ?? ''));
        $salt = ($config['hash_salt'] ?? '') ?: $config['telegram_bot_token'];
        $id = hash_hmac('sha256', 'id:' . $lead['requestId'], $salt);
        $isPhone = $lead['method'] === 'phone' || ($lead['method'] === 'telegram' && !str_starts_with($lead['contact'], '@'));
        $contact = $isPhone ? preg_replace('/^8(?=\d{10}$)/', '7', preg_replace('/\D/', '', $lead['contact'])) : mb_strtolower($lead['contact']);
        $fingerprint = hash_hmac('sha256', implode('|', [$contact, $lead['generator'], mb_strtolower($lead['task'])]), $salt);
        // Trust only the web server's client address. Forwarded headers are caller-controlled.
        $ip = hash_hmac('sha256', 'ip:' . ($server['REMOTE_ADDR'] ?? 'unknown'), $salt);
        $db->prepare('DELETE FROM lead_delivery WHERE expires_at < ?')->execute([$now]);
        $existing = findExisting($db, $id, $fingerprint);
        if ($existing !== false) return existingResponse($existing, $fingerprint);
        $insert = $db->prepare("INSERT OR IGNORE INTO lead_delivery (id,fingerprint,ip_hash,status,created_at,expires_at)
            SELECT ?,?,?,'pending',?,? WHERE (SELECT COUNT(*) FROM lead_delivery WHERE ip_hash=? AND created_at>?) < 4");
        $insert->execute([$id, $fingerprint, $ip, $now, $now + 600000, $ip, $now - 60000]);
        if ($insert->rowCount() === 0) {
            $existing = findExisting($db, $id, $fingerprint);
            return $existing !== false ? existingResponse($existing, $fingerprint) : reply(429, 'Слишком много отправок. Подождите минуту или свяжитесь с нами по телефону.');
        }
    } catch (\Throwable $error) { return reply(503, UNAVAILABLE); }

    try {
        $payload = ['chat_id' => $config['telegram_chat_id'], 'text' => telegramText($lead, $now), 'link_preview_options' => ['is_disabled' => true]];
        $thread = (string)($config['telegram_message_thread_id'] ?? '');
        if (preg_match('/^[1-9]\d*$/D', $thread)) $payload['message_thread_id'] = (int)$thread;
        $result = ($transport ?? __NAMESPACE__ . '\\sendTelegram')($config, $payload);
        $data = $result['data'] ?? null;
        if (($result['status'] ?? 0) < 200 || ($result['status'] ?? 0) >= 300 || !is_array($data) || ($data['ok'] ?? null) !== true || !is_int($data['result']['message_id'] ?? null) || $data['result']['message_id'] <= 0) {
            $db->prepare("UPDATE lead_delivery SET status='rejected',expires_at=? WHERE id=?")->execute([$now + 60000, $id]);
            return reply(502, 'Сейчас не удалось отправить заявку. Попробуйте через минуту или позвоните нам.');
        }
        try { $db->prepare("UPDATE lead_delivery SET status='sent' WHERE id=?")->execute([$id]); }
        catch (\Throwable $error) { /* Confirmed delivery; a pending reservation still prevents automatic duplicates. */ }
        return reply(200, 'Заявка доставлена.');
    } catch (\Throwable $error) {
        // Timeouts are ambiguous: reserve for ten minutes, never auto-retry, never claim delivery.
        try { $db->prepare("UPDATE lead_delivery SET status='uncertain' WHERE id=?")->execute([$id]); }
        catch (\Throwable $error) { /* The original reservation remains pending. */ }
        return reply(502, 'Не удалось подтвердить доставку заявки. Попробуйте позже или свяжитесь с нами по телефону.');
    }
}
