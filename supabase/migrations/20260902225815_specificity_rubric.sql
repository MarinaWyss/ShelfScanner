-- Specificity is a hand-entered 1-3 rubric (proposal D6). Enforce the range
-- at the database so a typo in the `score` command cannot skew the report.
-- The count of scores is checked in code against the parsed recommendations.

alter table public.recommendations
  add constraint recommendations_specificity_scores_rubric
  check (specificity_scores is null or specificity_scores <@ array[1, 2, 3]::smallint[]);
