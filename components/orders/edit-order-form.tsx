"use client";
import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { Save, Loader2 } from "lucide-react";
import { updateOrder } from "@/lib/orders/actions";

type Prod = { id: string; name: string; sku: string; sale_price_mad: number };

interface Props {
  orderId: string;
  defaultValues: {
    customer_name: string; customer_phone: string;
    customer_city: string; customer_address: string;
    notes: string; shipping_charge: number; source: string;
    product_id: string; quantity: number;
  };
  products: Prod[];
}

export function EditOrderForm({ orderId, defaultValues, products }: Props) {
  const router  = useRouter();
  const [isPending, startTransition] = useTransition();
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [success, setSuccess] = useState(false);

  function handleSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    setErrors({});
    const fd = new FormData(e.currentTarget);
    startTransition(async () => {
      const res = await updateOrder(orderId, fd);
      if (!res.success) {
        setErrors(res.errors ?? {});
      } else {
        setSuccess(true);
        setTimeout(() => router.push(`/admin/orders/${orderId}`), 800);
      }
    });
  }

  const INPUT = "flex h-10 w-full rounded-md border border-input bg-background px-3 py-2 text-sm placeholder:text-muted-foreground focus:outline-none focus:ring-2 focus:ring-ring disabled:opacity-50";
  const LABEL = "text-sm font-medium text-foreground mb-1.5 block";

  return (
    <form onSubmit={handleSubmit} className="space-y-5 rounded-xl border bg-card p-6">
      {errors._form && (
        <div className="rounded-lg bg-red-50 border border-red-200 px-4 py-3 text-sm text-red-700">
          {errors._form}
        </div>
      )}
      {success && (
        <div className="rounded-lg bg-green-50 border border-green-200 px-4 py-3 text-sm text-green-700">
          ✓ Commande modifiée — redirection…
        </div>
      )}

      {/* Client info */}
      <div className="grid grid-cols-2 gap-4">
        <div>
          <label className={LABEL}>Nom client *</label>
          <input name="customer_name" defaultValue={defaultValues.customer_name}
            className={INPUT} placeholder="Nom complet" />
          {errors.customer_name && <p className="text-xs text-red-600 mt-1">{errors.customer_name}</p>}
        </div>
        <div>
          <label className={LABEL}>Téléphone *</label>
          <input name="customer_phone" defaultValue={defaultValues.customer_phone}
            className={INPUT} placeholder="06XXXXXXXX" />
          {errors.customer_phone && <p className="text-xs text-red-600 mt-1">{errors.customer_phone}</p>}
        </div>
      </div>

      <div className="grid grid-cols-2 gap-4">
        <div>
          <label className={LABEL}>Ville *</label>
          <input name="customer_city" defaultValue={defaultValues.customer_city}
            className={INPUT} placeholder="Casablanca" />
          {errors.customer_city && <p className="text-xs text-red-600 mt-1">{errors.customer_city}</p>}
        </div>
        <div>
          <label className={LABEL}>Adresse</label>
          <input name="customer_address" defaultValue={defaultValues.customer_address}
            className={INPUT} placeholder="Adresse complète" />
        </div>
      </div>

      {/* Product */}
      <div className="grid grid-cols-3 gap-4">
        <div className="col-span-2">
          <label className={LABEL}>Produit</label>
          <select name="product_id" defaultValue={defaultValues.product_id} className={INPUT}>
            <option value="">— Garder produit actuel —</option>
            {products.map((p) => (
              <option key={p.id} value={p.id}>
                {p.name} ({p.sku}) — {p.sale_price_mad} MAD
              </option>
            ))}
          </select>
          {errors.product_id && <p className="text-xs text-red-600 mt-1">{errors.product_id}</p>}
        </div>
        <div>
          <label className={LABEL}>Quantité</label>
          <input name="quantity" type="number" min="1" defaultValue={defaultValues.quantity}
            className={INPUT} />
          {errors.quantity && <p className="text-xs text-red-600 mt-1">{errors.quantity}</p>}
        </div>
      </div>

      <div className="grid grid-cols-2 gap-4">
        <div>
          <label className={LABEL}>Frais de livraison (MAD)</label>
          <input name="shipping_charge" type="number" min="0" step="0.01"
            defaultValue={defaultValues.shipping_charge} className={INPUT} />
        </div>
        <div>
          <label className={LABEL}>Source</label>
          <select name="source" defaultValue={defaultValues.source} className={INPUT}>
            <option value="">— Source —</option>
            <option value="facebook">Facebook</option>
            <option value="instagram">Instagram</option>
            <option value="tiktok">TikTok</option>
            <option value="whatsapp">WhatsApp</option>
            <option value="phone">Téléphone</option>
            <option value="manual">Manuel</option>
            <option value="sheet_sync">Google Sheet</option>
          </select>
        </div>
      </div>

      <div>
        <label className={LABEL}>Notes</label>
        <textarea name="notes" defaultValue={defaultValues.notes} rows={3}
          className="flex min-h-[80px] w-full rounded-md border border-input bg-background px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-ring"
          placeholder="Notes internes…" />
      </div>

      <div className="flex gap-3 pt-2">
        <button type="submit" disabled={isPending || success}
          className="flex items-center gap-2 rounded-lg bg-primary px-5 py-2.5 text-sm font-semibold text-primary-foreground hover:opacity-90 disabled:opacity-50 transition-colors">
          {isPending ? <Loader2 className="h-4 w-4 animate-spin" /> : <Save className="h-4 w-4" />}
          {isPending ? "Sauvegarde…" : "Sauvegarder"}
        </button>
        <a href={`/admin/orders/${orderId}`}
          className="flex items-center rounded-lg border px-5 py-2.5 text-sm font-medium hover:bg-secondary transition-colors">
          Annuler
        </a>
      </div>
    </form>
  );
}
