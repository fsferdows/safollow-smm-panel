<?php
/**
 * SAFollow Official PHP SDK & API Example
 * Run: php sdk/examples/php_example.php
 */

require_once __DIR__ . '/../php/Safollow.php';
require_once __DIR__ . '/../php/Api.php';

use Safollow\SafollowClient;

// Admin API Key
$apiKey = getenv('SAFOLLOW_API_KEY') ?: 'saf_admin_a9b2b11373af7a43446f2935d0c6f793';
$apiUrlV2 = getenv('SAFOLLOW_API_URL') ?: 'http://localhost:3001/api/v2';
$apiUrlV1 = 'http://localhost:3001/api/v1';

echo "========================================================\n";
echo "1. Testing with SafollowClient (OOP SDK - /api/v2)\n";
echo "========================================================\n";

try {
    $client = new SafollowClient($apiKey, $apiUrlV2);

    // Balance
    $balance = $client->getBalance();
    echo "💰 Balance: \${$balance['balance']} {$balance['currency']}\n";

    // Services
    $services = $client->getServices();
    echo "📋 Services Available: " . count($services) . "\n";

    // Place Order for Instagram Followers
    echo "🚀 Placing order for @fsferdows...\n";
    $order = $client->createOrder(1925, 'https://www.instagram.com/fsferdows/', 100);
    echo "✅ Order Created: #{$order['order']}\n";

    // Check Status
    $status = $client->getStatus($order['order']);
    echo "📊 Status: [{$status['status']}] | Remains: {$status['remains']} | Charge: \${$status['charge']} {$status['currency']}\n";

} catch (\Exception $e) {
    echo "❌ Error: " . $e->getMessage() . "\n";
}

echo "\n========================================================\n";
echo "2. Testing with Standard SMM Api Class (/api/v1)\n";
echo "========================================================\n";

try {
    $api = new Api($apiKey, $apiUrlV1);

    // Balance
    $bal = $api->balance();
    echo "💰 Balance: \${$bal->balance} {$bal->currency}\n";

    // Order using the exact syntax: $api->order(['service' => ..., 'link' => ..., 'quantity' => ...])
    $legacyOrder = $api->order([
        'service'  => 1925,
        'link'     => 'https://www.instagram.com/fsferdows/',
        'quantity' => 100
    ]);
    echo "✅ Order Created via Api class: #{$legacyOrder->order}\n";

    // Status
    $legStatus = $api->status($legacyOrder->order);
    echo "📊 Status: [{$legStatus->status}] | Remains: {$legStatus->remains}\n";

    // Multi-status
    $multi = $api->multi_status([$legacyOrder->order, $order['order']]);
    echo "📑 Multi-status count: " . count((array)$multi) . "\n";

} catch (\Exception $e) {
    echo "❌ Error: " . $e->getMessage() . "\n";
}

echo "\n✨ All PHP SDK and API tests passed successfully!\n";
