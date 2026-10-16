/** Speedaf Open API (v1.3) — types partagés client/serveur. */
export type SpeedafEnv = "uat" | "prod";

export type SpeedafConfig = {
  enabled: boolean;
  env: SpeedafEnv;
  appCode: string;          // fourni par Speedaf (UAT Maroc : MA000025)
  customerCode: string;     // fourni par Speedaf
  platformSource: string;   // fourni par Speedaf
  secretKey: string;        // pour vérifier la signature du webhook (fourni par Speedaf)
  // Expéditeur (nous)
  senderName: string;
  senderMobile: string;
  senderAddress: string;
  senderProvince: string;
  senderCity: string;
  senderDistrict: string;
  // Options colis
  labelType: 2 | 5 | 46;    // 2 = 10×18 sans logo · 5 = 10×15 avec logo · 46 = Maroc 10×10
  isAllowOpen: 0 | 1;       // le client peut ouvrir le colis avant de payer
  defaultWeightKg: number;
  webhookSubscribedAt?: string | null;
  /** Correspondances manuelles : ville de la commande (normalisée) → ville Speedaf */
  cityMap: Record<string, string>;
};

export const DEFAULT_SPEEDAF_CONFIG: SpeedafConfig = {
  enabled: false,
  env: "uat",
  appCode: "MA000025",
  customerCode: "MA000025",
  platformSource: "TEST Platform",
  secretKey: "",
  senderName: "HajtekZone",
  senderMobile: "",
  senderAddress: "",
  senderProvince: "Casablanca - Settat",
  senderCity: "Casablanca",
  senderDistrict: "Casablanca",
  labelType: 5,
  isAllowOpen: 1,
  defaultWeightKg: 1,
  webhookSubscribedAt: null,
  cityMap: {},
};

export const SPEEDAF_BASE_URL: Record<SpeedafEnv, string> = {
  uat: "https://uat-api.speedaf.com/open-api",
  prod: "https://apis.speedaf.com/open-api",
};
