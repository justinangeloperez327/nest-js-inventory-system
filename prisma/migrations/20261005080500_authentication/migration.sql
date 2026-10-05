CREATE TABLE "refresh_tokens" (
    "id" UUID NOT NULL,
    "user_id" UUID NOT NULL,
    "token_hash" TEXT NOT NULL,
    "expires_at" TIMESTAMPTZ(3) NOT NULL,
    "revoked_at" TIMESTAMPTZ(3),
    "replaced_by_token_id" UUID,
    "created_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "refresh_tokens_pkey" PRIMARY KEY ("id")
);

CREATE INDEX "refresh_tokens_user_id_idx"
ON "refresh_tokens"("user_id");

CREATE INDEX "refresh_tokens_expires_at_idx"
ON "refresh_tokens"("expires_at");

ALTER TABLE "refresh_tokens"
ADD CONSTRAINT "refresh_tokens_user_id_fkey"
FOREIGN KEY ("user_id") REFERENCES "users"("id")
ON DELETE CASCADE ON UPDATE CASCADE;
