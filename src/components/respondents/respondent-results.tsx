import { RespondentTable } from "@/components/respondents/respondent-table";
import type { RespondentPiiDto } from "@/types/respondent-pii";

export function RespondentResults({
  respondents,
  total,
}: Readonly<{ respondents: RespondentPiiDto[]; total: number }>) {
  return (
    <>
      <p className="mt-5 text-sm text-slate-500">
        {total} respondent{total === 1 ? "" : "s"}
      </p>
      <RespondentTable respondents={respondents} />
    </>
  );
}
