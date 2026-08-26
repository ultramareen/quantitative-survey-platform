CREATE TYPE "QuestionType" AS ENUM ('SINGLE_CHOICE', 'MULTIPLE_CHOICE', 'FREE_TEXT');

CREATE TABLE "questions" (
  "id" UUID NOT NULL,
  "survey_id" UUID NOT NULL,
  "position" INT2 NOT NULL,
  "type" "QuestionType" NOT NULL,
  "prompt" STRING(4000) NOT NULL,
  "required" BOOL NOT NULL DEFAULT false,
  "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updated_at" TIMESTAMPTZ(6) NOT NULL,
  CONSTRAINT "questions_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "questions_survey_id_fkey" FOREIGN KEY ("survey_id") REFERENCES "surveys"("id") ON DELETE RESTRICT ON UPDATE RESTRICT,
  CONSTRAINT "questions_position_check" CHECK ("position" BETWEEN 1 AND 50)
);

CREATE INDEX "questions_survey_id_idx" ON "questions"("survey_id");
CREATE UNIQUE INDEX "questions_survey_id_position_key" ON "questions"("survey_id", "position");
CREATE UNIQUE INDEX "questions_id_survey_id_key" ON "questions"("id", "survey_id");

CREATE TABLE "answer_options" (
  "id" UUID NOT NULL,
  "question_id" UUID NOT NULL,
  "survey_id" UUID NOT NULL,
  "position" INT2 NOT NULL,
  "label" STRING(1000) NOT NULL,
  "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updated_at" TIMESTAMPTZ(6) NOT NULL,
  CONSTRAINT "answer_options_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "answer_options_question_id_survey_id_fkey" FOREIGN KEY ("question_id", "survey_id") REFERENCES "questions"("id", "survey_id") ON DELETE RESTRICT ON UPDATE RESTRICT,
  CONSTRAINT "answer_options_position_check" CHECK ("position" BETWEEN 1 AND 11)
);

CREATE INDEX "answer_options_survey_id_idx" ON "answer_options"("survey_id");
CREATE UNIQUE INDEX "answer_options_question_id_position_key" ON "answer_options"("question_id", "position");
