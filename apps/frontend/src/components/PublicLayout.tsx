import type { ReactNode } from 'react';
import { Footer } from './Footer';
import { Header } from './Header';

interface Props {
  children: ReactNode;
  className?: string;
}

/** Shared chrome for public pages: fixed Header + Footer. */
export function PublicLayout({ children, className = '' }: Props) {
  return (
    <div className={`app-bg flex flex-col ${className}`.trim()}>
      <Header />
      <div className="flex-1 flex flex-col pt-[72px] sm:pt-[86px]">{children}</div>
      <Footer />
    </div>
  );
}
