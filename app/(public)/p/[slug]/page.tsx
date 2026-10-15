import { permanentRedirect } from "next/navigation";

// /p/[slug] était l'adresse de test de la landing simple → maintenant c'est /lp/[slug].
export default async function P({ params }: { params: Promise<{ slug: string }> }) {
  const { slug } = await params;
  permanentRedirect(`/lp/${slug}`);
}
