import type { Metadata } from "next";
import { LoginForm } from "@/components/auth/login-form";
import { HajtekLogo } from "@/components/brand/logo";

export const metadata: Metadata = { title: "Connexion" };

interface LoginPageProps {
  searchParams: Promise<{ redirectTo?: string; error?: string }>;
}

export default async function LoginPage({ searchParams }: LoginPageProps) {
  const params = await searchParams;

  return (
    <div className="space-y-6">
      <div className="text-center space-y-2">
        <div className="mb-5 flex justify-center"><HajtekLogo tone="light" /></div>
        <h1 className="text-2xl font-bold tracking-tight">Connexion</h1>
        <p className="text-muted-foreground text-sm">
          Connectez-vous à votre espace de gestion
        </p>
      </div>

      {params.error && (
        <div className="rounded-md border border-destructive/30 bg-destructive/10 px-4 py-3 text-sm text-destructive">
          {params.error === "unauthorized"
            ? "Accès non autorisé."
            : "Une erreur s'est produite. Veuillez réessayer."}
        </div>
      )}

      <LoginForm redirectTo={params.redirectTo} />
    </div>
  );
}
