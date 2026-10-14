export default function AuthLayout({ children }: { children: React.ReactNode }) {
  return (
    <div className="relative flex min-h-screen items-center justify-center overflow-hidden bg-[#0d0d0d] px-4">
      <div className="pointer-events-none absolute -top-40 left-1/2 h-[520px] w-[520px] -translate-x-1/2 rounded-full bg-[#D4A93F]/20 blur-[120px]" />
      <div className="relative w-full max-w-md animate-fade-in-up rounded-2xl border border-white/10 bg-white p-7 shadow-2xl">
        {children}
      </div>
    </div>
  );
}
