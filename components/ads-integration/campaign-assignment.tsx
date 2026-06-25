"use client";

import { useState, useEffect, useTransition } from "react";
import { listMetaCampaigns, saveCampaignAssignments, getCampaignAssignments } from "@/lib/ads/actions";

interface Product { id: string; name: string; sku: string; }
interface Campaign { id: string; name: string; status: string; }
interface Assignment { campaign_id: string; campaign_name: string; product_id: string; }

interface Props { products: Product[]; }

export function CampaignAssignment({ products }: Props) {
  const [campaigns, setCampaigns] = useState<Campaign[]>([]);
  const [assignments, setAssignments] = useState<Record<string, string>>({}); // campaign_id → product_id
  const [loading, setLoading] = useState(false);
  const [saving, startSaving] = useTransition();
  const [saved, setSaved] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function load() {
    setLoading(true);
    setError(null);
    try {
      const [camResult, savedAssignments] = await Promise.all([
        listMetaCampaigns(),
        getCampaignAssignments(),
      ]);
      if (!camResult.ok) { setError(camResult.error ?? "Erreur"); return; }
      setCampaigns(camResult.campaigns ?? []);
      const map: Record<string, string> = {};
      for (const a of (savedAssignments as Assignment[])) map[a.campaign_id] = a.product_id;
      setAssignments(map);
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => { load(); }, []);

  function handleChange(campaignId: string, productId: string) {
    setAssignments((prev) => ({ ...prev, [campaignId]: productId }));
  }

  function handleSave() {
    startSaving(async () => {
      const rows = campaigns.map((c) => ({
        campaign_id: c.id,
        campaign_name: c.name,
        product_id: assignments[c.id] || null,
      }));
      await saveCampaignAssignments(rows);
      setSaved(true);
      setTimeout(() => setSaved(false), 3000);
    });
  }

  const statusColor = (s: string) => s === "ACTIVE" ? "#16a34a" : s === "PAUSED" ? "#ca8a04" : "#6b7280";

  return (
    <div style={{ marginTop: 24, borderTop: "1px solid #e5e7eb", paddingTop: 20 }}>
      <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 12 }}>
        <h3 style={{ fontWeight: 700, fontSize: 15, margin: 0 }}>🔗 Assignation Campagnes → Produits</h3>
        <div style={{ display: "flex", gap: 8 }}>
          <button onClick={load} disabled={loading}
            style={{ padding: "6px 12px", borderRadius: 8, border: "1px solid #d1d5db", background: "#f9fafb", fontSize: 13, cursor: "pointer" }}>
            {loading ? "Chargement..." : "🔄 Actualiser"}
          </button>
          <button onClick={handleSave} disabled={saving}
            style={{ padding: "6px 14px", borderRadius: 8, border: "none", background: "#2563eb", color: "#fff", fontSize: 13, fontWeight: 600, cursor: "pointer" }}>
            {saving ? "Sauvegarde..." : saved ? "✓ Sauvegardé" : "Sauvegarder"}
          </button>
        </div>
      </div>

      {error && <p style={{ color: "#dc2626", fontSize: 13, marginBottom: 8 }}>{error}</p>}

      <p style={{ fontSize: 12, color: "#6b7280", marginBottom: 12 }}>
        Assignez chaque campagne Meta à un produit. Le sync utilisera ces assignations pour calculer les dépenses exactes par produit.
      </p>

      {campaigns.length === 0 && !loading && (
        <p style={{ color: "#9ca3af", fontSize: 13 }}>Aucune campagne trouvée — vérifiez votre token Meta.</p>
      )}

      <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
        {campaigns.map((c) => (
          <div key={c.id} style={{ display: "flex", alignItems: "center", gap: 12, padding: "10px 14px", background: "#f9fafb", borderRadius: 10, border: "1px solid #e5e7eb" }}>
            <div style={{ flex: 1, minWidth: 0 }}>
              <p style={{ margin: 0, fontSize: 13, fontWeight: 600, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{c.name}</p>
              <span style={{ fontSize: 11, color: statusColor(c.status), fontWeight: 600 }}>{c.status}</span>
            </div>
            <select
              value={assignments[c.id] ?? ""}
              onChange={(e) => handleChange(c.id, e.target.value)}
              style={{ padding: "6px 10px", borderRadius: 8, border: "1px solid #d1d5db", fontSize: 13, minWidth: 180, background: "#fff" }}
            >
              <option value="">— Non assigné —</option>
              {products.map((p) => (
                <option key={p.id} value={p.id}>{p.name}</option>
              ))}
            </select>
          </div>
        ))}
      </div>
    </div>
  );
}
