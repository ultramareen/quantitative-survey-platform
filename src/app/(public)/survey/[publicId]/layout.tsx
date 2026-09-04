import { PublicShell } from "@/components/layout/public-shell";

export default function SurveyLayout({
  children,
}: Readonly<{ children: React.ReactNode }>) {
  return (
    <div className="respondent-theme">
      <PublicShell>{children}</PublicShell>
    </div>
  );
}
