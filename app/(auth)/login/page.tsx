import type { Metadata } from "next";
import { LoginForm } from "@/components/auth/login-form";

export const metadata: Metadata = { title: "Connexion" };

interface LoginPageProps {
  searchParams: Promise<{ redirectTo?: string; error?: string }>;
}

export default async function LoginPage({ searchParams }: LoginPageProps) {
  const params = await searchParams;

  return (
    <div className="space-y-6">
      <div className="text-center space-y-2">
        <div className="flex items-center justify-center gap-2 mb-4">
          <div className="h-9 w-9 rounded-lg bg-primary flex items-center justify-center">
            <span className="text-primary-foreground font-bold text-sm">GP</span>
          </div>
          <span className="text-xl font-semibold tracking-tight">GestionPro</span>
        </div>
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
