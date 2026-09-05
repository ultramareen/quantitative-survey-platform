ALTER TABLE answer_options
  ADD COLUMN branch_destination_question_id UUID NULL,
  ADD COLUMN branch_ends_survey BOOL NOT NULL DEFAULT false;

ALTER TABLE answer_options
  ADD CONSTRAINT answer_options_branch_destination_shape_check
  CHECK (NOT (branch_ends_survey AND branch_destination_question_id IS NOT NULL));

CREATE INDEX answer_options_branch_destination_idx
  ON answer_options (survey_id, branch_destination_question_id);
