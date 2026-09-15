import PageTransition from '@/shared/components/ui/PageTransition';

export default function MainTemplate({ children }: { children: React.ReactNode }) {
  return <PageTransition>{children}</PageTransition>;
}
