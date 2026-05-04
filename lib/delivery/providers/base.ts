/**
 * lib/delivery/providers/base.ts
 * Abstract delivery provider interface.
 * All providers must implement this contract.
 */

export interface ShipmentPayload {
  orderId:         string;
  orderNumber:     string;
  customerName:    string;
  customerPhone:   string;
  customerCity:    string;
  customerAddress: string;
  codAmount:       number;  // amount to collect on delivery
  notes?:          string;
  productName?:    string;
  quantity?:       number;
}

export interface ShipmentResult {
  success:         boolean;
  trackingNumber?: string;
  externalOrderId?:string;
  rawPayload?:     Record<string, unknown>;
  error?:          string;
}

export interface TrackingEvent {
  trackingNumber:  string;
  externalStatus:  string;
  internalStatus:  string;
  eventTime:       string;
  rawPayload:      Record<string, unknown>;
}

export interface InvoiceListItem {
  invoiceNumber: string;
  invoiceDate:   string;
  totalAmount:   number;
  status:        string;
}

export interface InvoiceDetail {
  invoiceNumber: string;
  invoiceDate:   string;
  totalAmount:   number;
  items: {
    trackingNumber: string;
    codAmount:      number;
    deliveryFee:    number;
    returnFee:      number;
    amountPaid:     number;
    status:         string;
  }[];
  rawPayload: Record<string, unknown>;
}

export interface DocumentResult {
  success:    boolean;
  fileUrl?:   string;
  externalId?:string;
  rawPayload?:Record<string, unknown>;
  error?:     string;
}

export abstract class DeliveryProvider {
  abstract readonly slug: string;
  abstract readonly name: string;

  abstract createShipment(payload: ShipmentPayload): Promise<ShipmentResult>;
  abstract getShipmentStatus(trackingNumber: string): Promise<TrackingEvent | null>;
  abstract listShipments(params: { from?: string; to?: string; page?: number }): Promise<TrackingEvent[]>;
  abstract getInvoices(params: { from?: string; to?: string }): Promise<InvoiceListItem[]>;
  abstract getInvoiceDetails(invoiceNumber: string): Promise<InvoiceDetail | null>;
  abstract getDeliveryBon(date: string): Promise<DocumentResult>;
  abstract getPickupBon(date: string): Promise<DocumentResult>;
  abstract getReturnBon(date: string): Promise<DocumentResult>;
}
