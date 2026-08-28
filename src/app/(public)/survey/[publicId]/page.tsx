import { PublicSurveyEntry } from "@/components/respondents/public-survey-entry";

export default async function PublicSurveyFoundationPage({
  params,
}: {
  params: Promise<{ publicId: string }>;
}) {
  const { publicId } = await params;

  return <PublicSurveyEntry publicId={publicId} />;
}
