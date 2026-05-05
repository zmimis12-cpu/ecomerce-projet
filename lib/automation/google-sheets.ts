/**
 * lib/automation/google-sheets.ts
 * Google Sheets API v4 integration — server-side only.
 * Uses service account JWT auth — no OAuth flow needed.
 *
 * NEVER import this file in client components.
 * All credentials are read from server-side env vars only.
 *
 * Auth flow:
 *  1. Create a JWT signed with the service account private key
 *  2. Exchange for an access token
 *  3. Use the access token for Sheets API calls
 *
 * No npm package needed — pure fetch + crypto (Node.js built-ins).
 */

const SHEETS_BASE = "https://sheets.googleapis.com/v4/spreadsheets";
const TOKEN_URL   = "https://oauth2.googleapis.com/token";
const SCOPE       = "https://www.googleapis.com/auth/spreadsheets";

// ─── Config validation ─────────────────────────────────────────────────────────
export function getSheetsConfig() {
  const email      = process.env.GOOGLE_SERVICE_ACCOUNT_EMAIL;
  const privateKey = process.env.GOOGLE_PRIVATE_KEY?.replace(/\\n/g, "\n");

  if (!email || !privateKey) {
    throw new Error(
      "Missing GOOGLE_SERVICE_ACCOUNT_EMAIL or GOOGLE_PRIVATE_KEY. " +
      "Add them to your Vercel environment variables."
    );
  }

  return {
    email,
    privateKey,
    sheets: {
      confirmed: {
        id:        process.env.GOOGLE_SHEET_ID_CONFIRMED ?? "",
        sheetName: process.env.GOOGLE_SHEET_NAME_CONFIRMED ?? "Confirmed Orders",
      },
      delivered_paid: {
        id:        process.env.GOOGLE_SHEET_ID_DELIVERED ?? "",
        sheetName: process.env.GOOGLE_SHEET_NAME_DELIVERED ?? "Delivered Paid Orders",
      },
      returned: {
        id:        process.env.GOOGLE_SHEET_ID_RETURNED ?? "",
        sheetName: process.env.GOOGLE_SHEET_NAME_RETURNED ?? "Returns",
      },
    },
  };
}

export type SheetType = "confirmed" | "delivered_paid" | "returned";

// ─── JWT auth ──────────────────────────────────────────────────────────────────
let cachedToken: { token: string; expiresAt: number } | null = null;

async function getAccessToken(): Promise<string> {
  // Return cached token if still valid (5 min buffer)
  if (cachedToken && Date.now() < cachedToken.expiresAt - 300_000) {
    return cachedToken.token;
  }

  const config = getSheetsConfig();
  const now    = Math.floor(Date.now() / 1000);

  const header  = { alg: "RS256", typ: "JWT" };
  const payload = {
    iss: config.email,
    scope: SCOPE,
    aud: TOKEN_URL,
    iat: now,
    exp: now + 3600,
  };

  const b64 = (obj: object) =>
    Buffer.from(JSON.stringify(obj)).toString("base64url");

  const unsigned = `${b64(header)}.${b64(payload)}`;

  // Sign with RSA-SHA256 using Node.js crypto
  const { createSign } = await import("crypto");
  const sign    = createSign("RSA-SHA256");
  sign.write(unsigned);
  sign.end();
  const signature = sign.sign(config.privateKey, "base64url");
  const jwt       = `${unsigned}.${signature}`;

  // Exchange JWT for access token
  const res = await fetch(TOKEN_URL, {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({
      grant_type: "urn:ietf:params:oauth:grant-type:jwt-bearer",
      assertion:  jwt,
    }),
  });

  if (!res.ok) {
    const err = await res.text();
    throw new Error(`Google OAuth failed: ${err}`);
  }

  const data = await res.json() as { access_token: string; expires_in: number };
  cachedToken = {
    token:     data.access_token,
    expiresAt: Date.now() + data.expires_in * 1000,
  };
  return cachedToken.token;
}

// ─── Append row to sheet ───────────────────────────────────────────────────────
export async function appendRowToSheet(
  spreadsheetId: string,
  sheetName: string,
  values: (string | number | null)[]
): Promise<{ updatedRange: string; updatedRows: number }> {
  const token = await getAccessToken();

  const range    = encodeURIComponent(`${sheetName}!A1`);
  const endpoint = `${SHEETS_BASE}/${spreadsheetId}/values/${range}:append`;

  const res = await fetch(`${endpoint}?valueInputOption=USER_ENTERED&insertDataOption=INSERT_ROWS`, {
    method:  "POST",
    headers: {
      Authorization: `Bearer ${token}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({ values: [values] }),
  });

  if (!res.ok) {
    const err = await res.text();
    throw new Error(`Sheets append failed [${res.status}]: ${err}`);
  }

  const data = await res.json() as {
    updates: { updatedRange: string; updatedRows: number };
  };
  return data.updates;
}

// ─── Check for existing row (duplicate detection) ──────────────────────────────
export async function findRowByOrderNumber(
  spreadsheetId: string,
  sheetName: string,
  orderNumber: string
): Promise<number | null> {
  const token   = await getAccessToken();
  const range   = encodeURIComponent(`${sheetName}!A:A`);
  const endpoint = `${SHEETS_BASE}/${spreadsheetId}/values/${range}`;

  const res = await fetch(endpoint, {
    headers: { Authorization: `Bearer ${token}` },
  });

  if (!res.ok) return null;

  const data = await res.json() as { values?: string[][] };
  if (!data.values) return null;

  const rowIdx = data.values.findIndex((row) => row[0] === orderNumber);
  return rowIdx === -1 ? null : rowIdx + 1; // 1-indexed
}

// ─── Ensure header row exists ──────────────────────────────────────────────────
export async function ensureSheetHeader(
  spreadsheetId: string,
  sheetName: string
): Promise<void> {
  const token = await getAccessToken();
  const range = encodeURIComponent(`${sheetName}!A1:L1`);
  const res   = await fetch(`${SHEETS_BASE}/${spreadsheetId}/values/${range}`, {
    headers: { Authorization: `Bearer ${token}` },
  });

  if (!res.ok) return;
  const data = await res.json() as { values?: string[][] };

  // Already has header
  if (data.values && data.values.length > 0 && data.values[0][0]) return;

  // Write header matching Google Sheet column spec
  const headers = [
    "Order Reference", "Name", "Phone", "Address", "City",
    "COD Amount", "Product SKU", "Quantity", "Notes",
    "Tracking Number", "Status", "Errors",
  ];

  await fetch(
    `${SHEETS_BASE}/${spreadsheetId}/values/${encodeURIComponent(`${sheetName}!A1`)}?valueInputOption=RAW`,
    {
      method:  "PUT",
      headers: { Authorization: `Bearer ${token}`, "Content-Type": "application/json" },
      body: JSON.stringify({ values: [headers] }),
    }
  );
}

// ─── Read all rows from sheet ──────────────────────────────────────────────────
export async function readSheetRows(
  spreadsheetId: string,
  sheetName: string,
  range = "A2:L1000"  // skip header row
): Promise<string[][]> {
  const token    = await getAccessToken();
  const encoded  = encodeURIComponent(`${sheetName}!${range}`);
  const endpoint = `${SHEETS_BASE}/${spreadsheetId}/values/${encoded}`;

  const res = await fetch(endpoint, {
    headers: { Authorization: `Bearer ${token}` },
    cache: "no-store",
  });

  if (!res.ok) {
    const err = await res.text();
    throw new Error(`Sheets read failed [${res.status}]: ${err.slice(0, 200)}`);
  }

  const data = await res.json() as { values?: string[][] };
  return data.values ?? [];
}

// ─── Update specific cells in a row (by row number 1-indexed) ─────────────────
export async function updateSheetRow(
  spreadsheetId: string,
  sheetName: string,
  rowNumber: number,               // 1-indexed (row 2 = first data row)
  values: Record<string, string>   // { J: "tracking", K: "Sent", L: "" }
): Promise<void> {
  const token = await getAccessToken();

  // Build batch update for specific cells
  const data = Object.entries(values).map(([col, val]) => ({
    range:  `${sheetName}!${col}${rowNumber}`,
    values: [[val]],
  }));

  const endpoint = `${SHEETS_BASE}/${spreadsheetId}/values:batchUpdate`;

  const res = await fetch(endpoint, {
    method:  "POST",
    headers: {
      Authorization:  `Bearer ${token}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      valueInputOption: "USER_ENTERED",
      data,
    }),
  });

  if (!res.ok) {
    const err = await res.text();
    throw new Error(`Sheets update failed [${res.status}]: ${err.slice(0, 200)}`);
  }
}
