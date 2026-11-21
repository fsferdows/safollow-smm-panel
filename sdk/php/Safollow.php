<?php
/**
 * SAFollow SMM Panel API — Official PHP SDK
 * Standard SMM API v2 Client for SAFollow Platform.
 */

namespace Safollow;

class SafollowClient {
    private string $apiKey;
    private string $apiUrl;

    public function __construct(string $apiKey, string $apiUrl = 'http://localhost:3001/api/v2') {
        if (empty($apiKey)) {
            throw new \InvalidArgumentException('SAFollow API Key is required');
        }
        $this->apiKey = trim($apiKey);
        $this->apiUrl = rtrim($apiUrl, '/');
    }

    private function request(string $action, array $params = []): array {
        $postData = array_merge([
            'key' => $this->apiKey,
            'action' => $action
        ], $params);

        $ch = curl_init($this->apiUrl);
        curl_setopt_array($ch, [
            CURLOPT_RETURNTRANSFER => true,
            CURLOPT_POST => true,
            CURLOPT_POSTFIELDS => http_build_query($postData),
            CURLOPT_TIMEOUT => 30,
            CURLOPT_USERAGENT => 'SAFollow-PhpSDK/1.0.0'
        ]);

        $response = curl_exec($ch);
        $httpCode = curl_getinfo($ch, CURLINFO_HTTP_CODE);

        if (curl_errno($ch)) {
            $err = curl_error($ch);
            curl_close($ch);
            throw new \RuntimeException("cURL request failed: " . $err);
        }
        curl_close($ch);

        $data = json_decode($response, true);
        if ($data === null) {
            throw new \RuntimeException("Failed to parse response: " . substr($response, 0, 150));
        }

        if (isset($data['error'])) {
            throw new \RuntimeException("[SAFollow API Error] " . $data['error']);
        }

        return $data;
    }

    public function getBalance(): array {
        return $this->request('balance');
    }

    public function getServices(): array {
        return $this->request('services');
    }

    public function createOrder(int $service, string $link, int $quantity, ?int $runs = null, ?int $interval = null): array {
        $params = [
            'service' => (string)$service,
            'link' => trim($link),
            'quantity' => (string)$quantity
        ];
        if ($runs !== null) $params['runs'] = (string)$runs;
        if ($interval !== null) $params['interval'] = (string)$interval;
        return $this->request('add', $params);
    }

    public function getStatus(int $orderId): array {
        return $this->request('status', ['order' => (string)$orderId]);
    }

    public function getMultipleStatuses(array $orderIds): array {
        return $this->request('status', ['orders' => implode(',', $orderIds)]);
    }

    public function requestRefill(int $orderId): array {
        return $this->request('refill', ['order' => (string)$orderId]);
    }

    public function getRefillStatus(int $refillId): array {
        return $this->request('refill_status', ['refill' => (string)$refillId]);
    }
}
