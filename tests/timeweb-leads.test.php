<?php
declare(strict_types=1);

require __DIR__ . '/../timeweb/server/lead-handler.php';

use function Energy\Timeweb\handleLead;
use function Energy\Timeweb\openDatabase;

foreach (['mbstring', 'pdo_sqlite'] as $extension) {
    if (!extension_loaded($extension)) throw new RuntimeException('Required test extension: ' . $extension);
}
$temporary = sys_get_temp_dir() . '/energy-php-tests-' . bin2hex(random_bytes(8));
mkdir($temporary, 0700, true);
$parentPid = getmypid();
register_shutdown_function(function () use ($temporary, $parentPid): void {
    if (getmypid() !== $parentPid) return;
    $remove = function (string $p) use (&$remove): void {
        if (is_dir($p)) { foreach (scandir($p) as $f) if ($f !== '.' && $f !== '..') $remove($p . '/' . $f); rmdir($p); }
        elseif (is_file($p)) unlink($p);
    };
    $remove($temporary);
});

const NOW = 1794400000000;
$count = 0;
function uuid(): string { return bin2hex(random_bytes(4)) . '-' . bin2hex(random_bytes(2)) . '-4' . substr(bin2hex(random_bytes(2)), 1) . '-8' . substr(bin2hex(random_bytes(2)), 1) . '-' . bin2hex(random_bytes(6)); }
function lead(array $changes = []): array { return array_replace([
    'requestId' => uuid(), 'startedAt' => NOW - 5000, 'contact' => '+7 (999) 000-00-01', 'method' => 'phone',
    'name' => 'Тестовая компания', 'task' => 'Тест, отправлять не нужно', 'generator' => 'В кожухе', 'consent' => true, 'website' => '',
    'page' => 'https://top-generator.ru/?utm_source=test&private=remove#request', 'referrer' => 'https://example.org/path?remove=1',
    'utm' => ['utm_source' => 'test', 'utm_campaign' => 'energy', 'unknown' => 'remove'],
], $changes); }
function server(array $changes = []): array { return array_replace([
    'REQUEST_METHOD' => 'POST', 'HTTP_ORIGIN' => 'https://top-generator.ru', 'CONTENT_TYPE' => 'application/json',
    'HTTP_SEC_FETCH_SITE' => 'same-origin', 'REMOTE_ADDR' => '192.0.2.1',
], $changes); }
function config(): array { global $temporary; return [
    'site_origin' => 'https://top-generator.ru', 'additional_origins' => [], 'telegram_bot_token' => 'test-only-not-a-token',
    'telegram_chat_id' => 'test-chat', 'hash_salt' => 'test-only-salt', 'storage_path' => $temporary . '/' . uuid(),
]; }
function success(array $config, array $payload): array { return ['status' => 200, 'data' => ['ok' => true, 'result' => ['message_id' => 123]]]; }
function send(array $lead, array $config, ?callable $transport = null, ?array $headers = null, int $now = NOW): array {
    return handleLead($headers ?? server(), json_encode($lead, JSON_THROW_ON_ERROR | JSON_UNESCAPED_UNICODE), $config, $transport ?? 'success', $now);
}
function expect(mixed $actual, mixed $expected, string $detail = ''): void { if ($actual !== $expected) throw new RuntimeException($detail . ': expected ' . json_encode($expected) . ', got ' . json_encode($actual)); }
function test(string $name, callable $fn): void { global $count; $fn(); ++$count; echo "ok $count - $name\n"; }

test('Telegram confirmation is required; payload includes the selected generator, page and UTM', function (): void {
    $captured = [];
    $result = send(lead(), config(), function ($c, $p) use (&$captured) { $captured = $p; return success($c, $p); });
    expect($result['status'], 200); expect($result['body']['ok'], true);
    foreach (['В кожухе', 'utm_source: test', 'utm_campaign: energy', 'Страница: https://top-generator.ru/?utm_source=test'] as $text) expect(str_contains($captured['text'], $text), true);
    expect(str_contains($captured['text'], 'private=remove'), false); expect(str_contains($captured['text'], 'remove=1'), false);
    expect(isset($captured['parse_mode']), false);
});
test('GET is rejected before any transport', function (): void { expect(send(lead(), config(), null, server(['REQUEST_METHOD' => 'GET']))['status'], 405); });
test('Foreign or missing Origin is rejected', function (): void {
    foreach (['https://evil.example', ''] as $origin) expect(send(lead(), config(), null, server(['HTTP_ORIGIN' => $origin]))['status'], 403);
});
test('Cross-site fetch metadata is rejected', function (): void { expect(send(lead(), config(), null, server(['HTTP_SEC_FETCH_SITE' => 'cross-site']))['status'], 403); });
test('An explicitly configured preview origin works', function (): void {
    $c = config(); $c['additional_origins'] = ['https://preview.example'];
    expect(send(lead(), $c, null, server(['HTTP_ORIGIN' => 'https://preview.example']))['status'], 200);
});
test('Non-JSON content is rejected', function (): void { expect(send(lead(), config(), null, server(['CONTENT_TYPE' => 'application/x-www-form-urlencoded']))['status'], 415); });
test('Malformed JSON is rejected', function (): void { expect(handleLead(server(), '{broken', config(), 'success', NOW)['status'], 400); });
test('JSON scalar and list are rejected', function (): void {
    foreach (['null', 'true', '"text"', '[1,2]'] as $body) expect(handleLead(server(), $body, config(), 'success', NOW)['status'], 400);
});
test('Both actual and declared body size are bounded', function (): void {
    expect(handleLead(server(), str_repeat('x', 12001), config(), 'success', NOW)['status'], 413);
    expect(send(lead(), config(), null, server(['CONTENT_LENGTH' => '12001']))['status'], 413);
});
test('Consent must be the boolean true', function (): void {
    foreach ([false, 'true', 1, null] as $consent) expect(send(lead(['consent' => $consent]), config())['status'], 400);
});
test('Honeypot and implausible fill times are rejected', function (): void {
    expect(send(lead(['website' => 'spam']), config())['status'], 400);
    foreach ([NOW - 500, NOW + 5000, NOW - 86400001, 'timestamp'] as $time) expect(send(lead(['startedAt' => $time]), config())['status'], 400);
});
test('Contact, generator, UUID and field lengths are checked', function (): void {
    foreach ([['contact' => '123'], ['method' => 'other'], ['generator' => 'invented'], ['requestId' => 'broken'], ['name' => str_repeat('я', 121)], ['task' => str_repeat('я', 1001)]] as $changes) expect(send(lead($changes), config())['status'], 400);
});
test('Email and Telegram contacts are supported', function (): void {
    expect(send(lead(['method' => 'email', 'contact' => 'test@example.org']), config())['status'], 200);
    expect(send(lead(['method' => 'telegram', 'contact' => '@energy_test']), config())['status'], 200);
});
test('Missing Telegram secrets fail honestly without a network request', function (): void {
    $c = config(); $c['telegram_bot_token'] = ''; $calls = 0;
    $r = send(lead(), $c, function ($c, $p) use (&$calls) { ++$calls; return success($c, $p); });
    expect($r['status'], 503); expect($calls, 0); expect($r['body']['ok'], false);
});
test('Telegram rejection is never reported as success', function (): void {
    $r = send(lead(), config(), fn() => ['status' => 400, 'data' => ['ok' => false]]);
    expect($r['status'], 502); expect($r['body']['ok'], false);
});
test('A message ID without the correct confirmation is insufficient', function (): void {
    foreach ([['ok' => 'true', 'result' => ['message_id' => 123]], ['ok' => true], ['ok' => true, 'result' => ['message_id' => '123']], ['ok' => true, 'result' => ['message_id' => 0]]] as $data) {
        expect(send(lead(), config(), fn() => ['status' => 200, 'data' => $data])['status'], 502);
    }
});
test('Confirmed duplicates are acknowledged without a second delivery', function (): void {
    $c = config(); $l = lead(); $calls = 0; $transport = function ($c, $p) use (&$calls) { ++$calls; return success($c, $p); };
    expect(send($l, $c, $transport)['status'], 200);
    $r = send($l, $c, $transport); expect($r['body']['duplicate'], true); expect($calls, 1);
});
test('Equivalent phone formatting is deduplicated across new UUIDs', function (): void {
    $c = config(); expect(send(lead(['contact' => '8 (999) 000-00-01']), $c)['status'], 200);
    expect(send(lead(), $c)['body']['duplicate'], true);
});
test('A reused request ID cannot change the lead content', function (): void {
    $c = config(); $l = lead(); send($l, $c);
    expect(send(array_replace($l, ['task' => 'Different task']), $c)['status'], 409);
});
test('An unconfirmed in-flight duplicate cannot send concurrently', function (): void {
    $c = config(); $l = lead(); $nested = null;
    send($l, $c, function ($config, $payload) use ($c, $l, &$nested) { $nested = send($l, $c); return success($config, $payload); });
    expect($nested['status'], 409);
});
test('Ambiguous delivery is reserved and does not auto-retry', function (): void {
    $c = config(); $l = lead(); $calls = 0;
    $transport = function () use (&$calls) { ++$calls; throw new RuntimeException('Simulated timeout'); };
    expect(send($l, $c, $transport)['status'], 502);
    expect(send($l, $c, $transport, null, NOW + 10000)['status'], 409); expect($calls, 1);
});
test('A rejected request may be sent after its backoff expires', function (): void {
    $c = config(); $l = lead(); send($l, $c, fn() => ['status' => 400, 'data' => ['ok' => false]]);
    expect(send($l, $c, null, null, NOW + 60001)['status'], 200);
});
test('Rate limits use the server IP and cannot be bypassed with forwarded headers', function (): void {
    $c = config();
    for ($i = 0; $i < 5; ++$i) {
        $r = send(lead(['contact' => '+7999000000' . $i]), $c, null, server(['HTTP_X_FORWARDED_FOR' => '198.51.100.' . $i]));
        expect($r['status'], $i < 4 ? 200 : 429);
    }
    expect(send(lead(['contact' => '+79990000009']), $c, null, null, NOW + 60001)['status'], 200);
});
test('The deduplication reservation expires', function (): void {
    $c = config(); $l = lead(); send($l, $c);
    $r = send($l, $c, null, null, NOW + 600001); expect($r['status'], 200); expect(isset($r['body']['duplicate']), false);
});
test('No contact, company or task is persisted in SQLite', function (): void {
    $c = config(); $l = lead(); send($l, $c);
    $bytes = file_get_contents($c['storage_path'] . '/leads.sqlite');
    foreach ([$l['contact'], $l['name'], $l['task'], $c['telegram_bot_token']] as $private) expect(str_contains($bytes, $private), false);
});
test('Storage inside document root is rejected', function (): void {
    global $temporary;
    $previous = $_SERVER['DOCUMENT_ROOT'] ?? null; $_SERVER['DOCUMENT_ROOT'] = $temporary;
    try { expect(send(lead(), config())['status'], 503); }
    finally { if ($previous === null) unset($_SERVER['DOCUMENT_ROOT']); else $_SERVER['DOCUMENT_ROOT'] = $previous; }
});
test('Private dotenv permits only documented keys without evaluating values', function (): void {
    global $temporary;
    $file = $temporary . '/environment';
    file_put_contents($file, '# comment' . "\nTELEGRAM_BOT_TOKEN='test-only-value'\nTELEGRAM_CHAT_ID=-123\nPATH=ignored\nLEAD_HASH_SALT=" . '"${NO_EXPANSION}"' . "\n");
    $parsed = \Energy\Timeweb\readEnvironmentFile($file);
    expect($parsed['TELEGRAM_BOT_TOKEN'], 'test-only-value'); expect($parsed['TELEGRAM_CHAT_ID'], '-123');
    expect($parsed['LEAD_HASH_SALT'], '${NO_EXPANSION}'); expect(isset($parsed['PATH']), false);
    expect(\Energy\Timeweb\readEnvironmentFile($temporary . '/missing'), []);
});
test('Parallel processes reserve a single delivery in real SQLite', function (): void {
    if (!function_exists('pcntl_fork')) throw new RuntimeException('pcntl is needed for the concurrency test');
    global $temporary;
    $c = config(); $l = lead(); openDatabase($c['storage_path']); $counter = $temporary . '/deliveries'; $children = [];
    for ($i = 0; $i < 8; ++$i) {
        $pid = pcntl_fork(); if ($pid === -1) throw new RuntimeException('fork failed');
        if ($pid === 0) {
            $r = send($l, $c, function ($config, $payload) use ($counter) { file_put_contents($counter, "sent\n", FILE_APPEND | LOCK_EX); usleep(75000); return success($config, $payload); });
            exit(in_array($r['status'], [200, 409], true) ? 0 : 1);
        }
        $children[] = $pid;
    }
    foreach ($children as $pid) { pcntl_waitpid($pid, $status); expect(pcntl_wexitstatus($status), 0); }
    expect(count(file($counter)), 1);
});

echo "Passed $count Timeweb PHP tests. Telegram transport was mocked; no real messages sent.\n";
