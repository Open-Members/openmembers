import PublicNavbar from "@/shared/components/ui/PublicNavbar";
import { SiteFooter } from "@/shared/components/ui/SiteFooter";
import { AuthLogo } from '@/features/Auth/components/shared/AuthLogo';

export default function PublicLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <div className="flex min-h-screen flex-col">
      <PublicNavbar brand={<AuthLogo />} />
      <main
        id="main-content"
        tabIndex={-1}
        className="flex-1 pt-20 focus:outline-none"
      >
        {children}
      </main>
      <SiteFooter />
    </div>
  );
}
