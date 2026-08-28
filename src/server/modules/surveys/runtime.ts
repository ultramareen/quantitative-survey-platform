import "server-only";
import { PgSurveyRepository } from "./repository";
import { SurveyService } from "./service";
let service: SurveyService | undefined;
export function getSurveyService() {
  service ??= new SurveyService(new PgSurveyRepository());
  return service;
}
