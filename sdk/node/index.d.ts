export interface ServiceItem {
  service: number;
  name: string;
  type: string;
  category: string;
  rate: string;
  min: string;
  max: string;
  refill: boolean;
  cancel: boolean;
}

export interface BalanceResponse {
  balance: string;
  currency: string;
}

export interface CreateOrderOptions {
  service: number | string;
  link: string;
  quantity: number | string;
  runs?: number;
  interval?: number;
}

export interface CreateOrderResponse {
  order: number;
}

export interface OrderStatusResponse {
  charge: string;
  start_count: number;
  status: 'Pending' | 'In progress' | 'Completed' | 'Partial' | 'Canceled' | 'Processing';
  remains: number;
  currency: string;
}

export class SafollowClient {
  constructor(apiKey: string, apiUrl?: string);
  getBalance(): Promise<BalanceResponse>;
  getServices(): Promise<ServiceItem[]>;
  createOrder(options: CreateOrderOptions): Promise<CreateOrderResponse>;
  getStatus(orderId: number | string): Promise<OrderStatusResponse>;
  getMultipleStatuses(orderIds: (number | string)[]): Promise<Record<string, OrderStatusResponse>>;
  requestRefill(orderId: number | string): Promise<{ refill: number }>;
  getRefillStatus(refillId: number | string): Promise<{ status: string }>;
}

export default SafollowClient;
