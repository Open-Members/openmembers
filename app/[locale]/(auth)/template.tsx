import PageTransition from '@/shared/components/ui/PageTransition';

export default function AuthTemplate({ children }: { children: React.ReactNode }) {
  return <PageTransition>{children}</PageTransition>;
}
