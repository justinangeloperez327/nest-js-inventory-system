CREATE INDEX "audit_logs_action_created_at_idx"
ON "audit_logs"("action", "created_at");

CREATE INDEX "audit_logs_entity_type_created_at_idx"
ON "audit_logs"("entity_type", "created_at");

CREATE INDEX "audit_logs_request_id_idx"
ON "audit_logs"("request_id");

ALTER TABLE "audit_logs"
ADD CONSTRAINT "audit_logs_action_not_blank"
CHECK (
  LENGTH(BTRIM("action")) > 0
  AND LENGTH("action") <= 100
);

ALTER TABLE "audit_logs"
ADD CONSTRAINT "audit_logs_entity_type_not_blank"
CHECK (
  LENGTH(BTRIM("entity_type")) > 0
  AND LENGTH("entity_type") <= 100
);

ALTER TABLE "audit_logs"
ADD CONSTRAINT "audit_logs_entity_id_length"
CHECK (
  "entity_id" IS NULL
  OR LENGTH("entity_id") <= 200
);

CREATE OR REPLACE FUNCTION prevent_audit_log_mutation()
RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
  RAISE EXCEPTION 'audit logs are immutable';
END;
$$;

CREATE TRIGGER "audit_logs_immutable"
BEFORE UPDATE OR DELETE ON "audit_logs"
FOR EACH ROW
EXECUTE FUNCTION prevent_audit_log_mutation();
