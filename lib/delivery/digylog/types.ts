/**
 * lib/delivery/digylog/types.ts
 * Digylog API v2.4 type definitions — based on official API docs.
 */

// ── Reference (product) ───────────────────────────────────────────────────────
export interface DigylogRef {
  designation: string;   // mode=1 (standard)
  ref?:        string;   // mode=2 (FC)
  quantity:    number;
}

// ── Single order payload for POST /orders ────────────────────────────────────
export interface DigylogOrderItem {
  num:          string;
  type:         1 | 2 | 3;    // 1=Normal, 2=Exchange
  mode:         1 | 2;        // 1=Standard, 2=FC
  network?:     string;       // id as string, required if mode=1
  fc?:          number | null;// required if mode=2
  store:        string;       // store name
  name:         string;
  phone:        string;       // 10 digits 05/06/07/08
  address:      string;
  city:         string;
  price:        number;
  refs:         DigylogRef[];
  openproduct:  0 | 1;
  port:         1 | 2;        // 1=By Customer, 2=By Seller
  note:         string;
  pickup?:      0 | 1;
  pickupPhone?: string;
  pickupArea?:  number;
  pickupAdress?:string;
}

// ── POST /orders body ────────────────────────────────────────────────────────
export interface DigylogCreateOrdersBody {
  network?:        number;   // required if mode=1
  fc?:             number;   // required if mode=2
  store:           string;
  mode:            1 | 2;
  status:          0 | 1;    // 0=add only, 1=add+send
  checkDuplicate?: 0 | 1;
  orders:          DigylogOrderItem[];
}

// ── POST /orders response item ───────────────────────────────────────────────
export interface DigylogCreatedOrder {
  num:      string;
  tracking: string;
  bl?:      number;
  [key: string]: unknown;
}

// ── PUT /orders/send response ────────────────────────────────────────────────
export interface DigylogSendResponse {
  bl: number;
}

// ── GET /networks ────────────────────────────────────────────────────────────
export interface DigylogNetwork {
  id:   number;
  name: string;
}

// ── GET /fc ──────────────────────────────────────────────────────────────────
export interface DigylogFC {
  id:   number;
  name: string;
}

// ── GET /stores ──────────────────────────────────────────────────────────────
export interface DigylogStore {
  id:   number;
  name: string;
}

// ── GET /cities ──────────────────────────────────────────────────────────────
export interface DigylogCity {
  name: string;
}

// ── GET /statuses ────────────────────────────────────────────────────────────
export interface DigylogStatus {
  id:    number;
  label: string;
}

// ── GET /order/:tracking/infos ───────────────────────────────────────────────
export interface DigylogOrderInfo {
  id:           number;
  hub_id:       number;
  deliveryCost: number;
  tracking?:    string;
  status?:      string;
  idStatus?:    number;
  [key: string]: unknown;
}

// ── GET /order/:tracking/refs ────────────────────────────────────────────────
export interface DigylogOrderRef {
  ref:         string;
  designation: string;
  quantity:    number;
}

// ── GET /historics ───────────────────────────────────────────────────────────
export interface DigylogHistoricEntry {
  date:       string;
  type:       string;
  location:   string;
  "old value":string;
  "new value":string;
}
export type DigylogHistorics = Record<string, DigylogHistoricEntry[]>;

// ── Webhook payload (from Digylog to our server) ─────────────────────────────
export interface DigylogWebhookPayload {
  tracking:    string;
  num:         string;
  status:      string;
  idStatus:    number;
  motif:       string;
  postponedTo: string | null;
  updatedAt:   string;
}

// ── GET /deliverycost ────────────────────────────────────────────────────────
export interface DigylogDeliveryCost {
  network: string;
  city:    string;
  cost:    string;
  timeMin: string;
  timeMax: string;
}

// ── GET /pickup/areas ────────────────────────────────────────────────────────
export interface DigylogPickupArea {
  id:      number;
  name:    string;
  mintime: string;
  maxtime: string;
}

// ── Digylog settings stored in DB ────────────────────────────────────────────
export interface DigylogSettings {
  id?:                    string;
  token:                  string;
  referer:                string;
  default_network_id:     number;
  default_store_name:     string;
  default_mode:           1 | 2;
  default_status_on_create: 0 | 1;
  default_port:           1 | 2;
  webhook_url?:           string;
  webhook_secret?:        string;
}
