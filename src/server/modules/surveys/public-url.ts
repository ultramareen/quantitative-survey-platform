export function buildPublicSurveyUrl(
  publicId: string,
  applicationOrigin: string,
) {
  return new URL(`/survey/${publicId}`, applicationOrigin).toString();
}
