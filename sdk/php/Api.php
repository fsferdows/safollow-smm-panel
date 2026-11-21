<?php
/**
 * SAFollow SMM Panel API — Standard PHP Client
 * Compatible with standard SMM API v1 & v2 panels (SmartPanel, PerfectPanel, RentalPanel)
 */

class Api {
    // API URL (can be /api/v1, /api/v2, or /api)
    public $api_url = 'http://localhost:3001/api/v1'; 

    // Your unique API key from Dashboard -> Profile / API
    public $api_key = ''; 

    public function __construct($api_key = '', $api_url = 'http://localhost:3001/api/v1') {
        if (!empty($api_key)) $this->api_key = $api_key;
        if (!empty($api_url)) $this->api_url = rtrim($api_url, '/');
    }

    /**
     * Add Order
     */
    public function add_order($data) { 
        $post = array_merge(array('key' => $this->api_key, 'action' => 'add'), $data);
        $result = $this->connect($post);
        return json_decode($result);
    }

    /**
     * Alias for add_order
     */
    public function order($data) {
        return $this->add_order($data);
    }

    /**
     * Order status
     */
    public function status($order_id) { 
        $result = $this->connect(array(
            'key'    => $this->api_key,
            'action' => 'status',
            'order'  => $order_id
        ));
        return json_decode($result);
    }

    /**
     * Order multi status
     */
    public function multi_status($order_ids) { 
        $result = $this->connect(array(
            'key'        => $this->api_key,
            'action'     => 'status',
            'orders'     => implode(",", (array)$order_ids)
        ));
        return json_decode($result);
    }

    /**
     * All services
     */
    public function services() { 
        $result = $this->connect(array(
            'key'     => $this->api_key,
            'action'  => 'services',
        ));
        return json_decode($result);
    }

    /**
     * Balance
     */
    public function balance() { 
        $result = $this->connect(array(
            'key'     => $this->api_key,
            'action'  => 'balance',
        ));
        return json_decode($result);
    }

    /**
     * Request Refill
     */
    public function refill($order_id) {
        $result = $this->connect(array(
            'key'    => $this->api_key,
            'action' => 'refill',
            'order'  => $order_id
        ));
        return json_decode($result);
    }

    /**
     * Multiple Refill
     */
    public function multiRefill($order_ids) {
        $result = $this->connect(array(
            'key'     => $this->api_key,
            'action'  => 'refill',
            'orders'  => implode(',', (array)$order_ids)
        ));
        return json_decode($result);
    }

    /**
     * Refill Status
     */
    public function refillStatus($refill_id) {
        $result = $this->connect(array(
            'key'     => $this->api_key,
            'action'  => 'refill_status',
            'refill'  => $refill_id
        ));
        return json_decode($result);
    }

    /**
     * Multiple Refill Status
     */
    public function multiRefillStatus($refill_ids) {
        $result = $this->connect(array(
            'key'     => $this->api_key,
            'action'  => 'refill_status',
            'refills' => implode(',', (array)$refill_ids)
        ));
        return json_decode($result);
    }

    /**
     * Cancel Orders
     */
    public function cancel($order_ids) {
        $result = $this->connect(array(
            'key'     => $this->api_key,
            'action'  => 'cancel',
            'orders'  => implode(',', (array)$order_ids)
        ));
        return json_decode($result);
    }

    /**
     * Connect to panel
     */
    private function connect($post) {
        $_post = Array();

        if (is_array($post)) {
          foreach ($post as $name => $value) {
            $_post[] = $name.'='.urlencode($value);
          }
        }

        $url_complete = '';
        if (is_array($post)) {
          $url_complete = join('&', $_post);
        }
        $url = $this->api_url."?".$url_complete;

        $ch = curl_init($url);
        curl_setopt($ch, CURLOPT_RETURNTRANSFER, 1);
        curl_setopt($ch, CURLOPT_HEADER, 0);
        curl_setopt($ch, CURLOPT_FOLLOWLOCATION, true);
        curl_setopt($ch, CURLOPT_USERAGENT, 'SAFollow-PhpAPI/1.0');
        $result = curl_exec($ch);
        if (curl_errno($ch) != 0 && empty($result)) {
          $result = false;
        }
        curl_close($ch);
        return $result;
    }
}
