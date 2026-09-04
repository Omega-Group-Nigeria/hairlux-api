UPDATE "staff"
SET "current_base_salary" = NULL, "current_allowances" = NULL
WHERE "compensation_type" = 'COMMISSION';