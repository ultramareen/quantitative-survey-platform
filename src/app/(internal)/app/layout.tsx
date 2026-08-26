import { InternalShell } from "@/components/layout/internal-shell";

export default function AppLayout({
  children,
}: Readonly<{ children: React.ReactNode }>) {
  return <InternalShell>{children}</InternalShell>;
}
