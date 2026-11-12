<?php
declare(strict_types=1);

ini_set('display_errors', '0');
header('Content-Type: application/json; charset=utf-8');
header('Cache-Control: no-store');
header('X-Content-Type-Options: nosniff');

$private = realpath(dirname(__DIR__, 2) . '/private');
$documentRoot = realpath($_SERVER['DOCUMENT_ROOT'] ?? dirname(__DIR__));
if ($private === false || ($documentRoot !== false && str_starts_with($private . DIRECTORY_SEPARATOR, $documentRoot . DIRECTORY_SEPARATOR))) {
    http_response_code(503);
    echo json_encode(['ok' => false, 'message' => 'Сейчас не удалось отправить заявку. Позвоните нам: +7 (967) 246-26-56.'], JSON_UNESCAPED_UNICODE);
    exit;
}

try {
    require_once $private . '/lead-handler.php';
    foreach (\Energy\Timeweb\readEnvironmentFile($private . '/.env') as $key => $value) {
        $processValue = getenv($key);
        if (!isset($_ENV[$key]) && ($processValue === false || $processValue === '')) $_ENV[$key] = $value;
    }
    $config = require $private . '/config.example.php';
    if (is_file($private . '/config.php')) {
        $localConfig = require $private . '/config.php';
        if (!is_array($localConfig)) throw new RuntimeException('Configuration unavailable');
        $config = array_replace($config, $localConfig);
    }
    $stream = fopen('php://input', 'rb');
    $body = $stream === false ? '' : stream_get_contents($stream, 12001);
    if (is_resource($stream)) fclose($stream);
    $result = \Energy\Timeweb\handleLead($_SERVER, is_string($body) ? $body : '', $config);
} catch (Throwable $error) {
    // Never echo exception details, credentials, or submitted fields.
    $result = ['status' => 503, 'body' => ['ok' => false, 'message' => 'Сейчас не удалось отправить заявку. Позвоните нам: +7 (967) 246-26-56.']];
}
http_response_code($result['status']);
if ($result['status'] === 405) header('Allow: POST');
echo json_encode($result['body'], JSON_UNESCAPED_UNICODE | JSON_UNESCAPED_SLASHES);
