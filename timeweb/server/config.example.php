<?php
declare(strict_types=1);

// Optional non-secret settings. Secrets are read from server environment / private .env.
$env = static fn(string $key): string => isset($_ENV[$key]) ? (string)$_ENV[$key] : (getenv($key) ?: '');
return [
    'site_origin' => 'https://top-generator.ru',
    'additional_origins' => [], // A verified Timeweb preview origin may be added here for testing.
    'telegram_bot_token' => $env('TELEGRAM_BOT_TOKEN'),
    'telegram_chat_id' => $env('TELEGRAM_CHAT_ID'),
    'telegram_message_thread_id' => $env('TELEGRAM_MESSAGE_THREAD_ID'),
    'hash_salt' => $env('LEAD_HASH_SALT'),
    'storage_path' => __DIR__ . '/storage',
];
