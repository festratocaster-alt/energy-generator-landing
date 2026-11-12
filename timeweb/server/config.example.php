<?php
declare(strict_types=1);

// Copy to config.php in this PRIVATE directory. Never place it in public_html or Git.
return [
    'site_origin' => 'https://top-generator.ru',
    'additional_origins' => [], // A verified Timeweb preview origin may be added here for testing.
    'telegram_bot_token' => getenv('TELEGRAM_BOT_TOKEN') ?: '',
    'telegram_chat_id' => getenv('TELEGRAM_CHAT_ID') ?: '',
    'telegram_message_thread_id' => getenv('TELEGRAM_MESSAGE_THREAD_ID') ?: '',
    'hash_salt' => getenv('LEAD_HASH_SALT') ?: '',
    'storage_path' => __DIR__ . '/storage',
];
