-- CI ONLY: minimal structural snapshot for isolated tests. Never deploy to the real database.
-- Generated from XRMOVI column metadata, without any customer records, API keys, or payments.
CREATE SCHEMA IF NOT EXISTS xrmovi;

CREATE TABLE xrmovi.plans (
  "code" text NOT NULL,
  "title" text NOT NULL,
  "vehicle_limit" integer,
  "seat_limit" integer,
  "monthly_brl" numeric(10,2),
  "active" boolean NOT NULL DEFAULT true,
  "company_limit" integer,
  "contract_limit" integer,
  PRIMARY KEY ("code")
);

CREATE TABLE xrmovi.companies (
  "id" uuid NOT NULL DEFAULT gen_random_uuid(),
  "name" text NOT NULL,
  "created_at" timestamp with time zone NOT NULL DEFAULT now(),
  "logo_path" text,
  "trade_name" text,
  "legal_name" text,
  "cnpj" text,
  "contact_email" text,
  "phone" text,
  "address" text,
  "report_color" text DEFAULT '#123E53'::text,
  "logo_url" text,
  PRIMARY KEY ("id")
);

CREATE TABLE xrmovi.billing_accounts (
  "id" uuid NOT NULL DEFAULT gen_random_uuid(),
  "owner_id" uuid NOT NULL,
  "plan_code" text NOT NULL,
  "status" text NOT NULL DEFAULT 'trial'::text,
  "trial_end" timestamp with time zone,
  "paid_through" timestamp with time zone,
  "provider" text,
  "provider_subscription_id" text,
  "created_at" timestamp with time zone NOT NULL DEFAULT now(),
  "updated_at" timestamp with time zone NOT NULL DEFAULT now(),
  PRIMARY KEY ("id")
);

CREATE TABLE xrmovi.account_companies (
  "account_id" uuid NOT NULL,
  "company_id" uuid NOT NULL,
  "created_at" timestamp with time zone NOT NULL DEFAULT now(),
  PRIMARY KEY ("account_id", "company_id")
);

CREATE TABLE xrmovi.subscriptions (
  "company_id" uuid NOT NULL,
  "plan_code" text NOT NULL,
  "status" text NOT NULL DEFAULT 'pending'::text,
  "trial_end" timestamp with time zone,
  "paid_through" timestamp with time zone,
  "provider_subscription_id" text,
  "updated_at" timestamp with time zone NOT NULL DEFAULT now(),
  PRIMARY KEY ("company_id")
);

CREATE TABLE xrmovi.memberships (
  "company_id" uuid NOT NULL,
  "user_id" uuid NOT NULL,
  "role" text NOT NULL,
  "created_at" timestamp with time zone NOT NULL DEFAULT now(),
  PRIMARY KEY ("company_id", "user_id")
);

CREATE TABLE xrmovi.platform_admins (
  "user_id" uuid NOT NULL,
  "granted_at" timestamp with time zone NOT NULL DEFAULT now(),
  PRIMARY KEY ("user_id")
);

CREATE TABLE xrmovi.contracts (
  "id" uuid NOT NULL DEFAULT gen_random_uuid(),
  "company_id" uuid NOT NULL,
  "name" text NOT NULL,
  "client_name" text,
  "contract_code" text,
  "active" boolean NOT NULL DEFAULT true,
  "created_at" timestamp with time zone NOT NULL DEFAULT now(),
  PRIMARY KEY ("id")
);

CREATE TABLE xrmovi.vehicles (
  "id" uuid NOT NULL DEFAULT gen_random_uuid(),
  "company_id" uuid NOT NULL,
  "plate" text NOT NULL,
  "model" text NOT NULL,
  "status" text NOT NULL DEFAULT 'Ativo'::text,
  "created_at" timestamp with time zone NOT NULL DEFAULT now(),
  "brand" text,
  "category" text NOT NULL DEFAULT 'Leve'::text,
  "manufacture_year" integer,
  "model_year" integer,
  "odometer_value" numeric(14,1) NOT NULL DEFAULT 0,
  "unit_name" text,
  "notes" text,
  "contract_id" uuid,
  "driver_id" uuid,
  PRIMARY KEY ("id")
);

CREATE TABLE xrmovi.billing_checkout_intents (
  "id" uuid NOT NULL DEFAULT gen_random_uuid(),
  "account_id" uuid NOT NULL,
  "plan_code" text NOT NULL,
  "requested_by" uuid NOT NULL,
  "amount_brl" numeric(10,2) NOT NULL,
  "provider" text NOT NULL DEFAULT 'mercadopago'::text,
  "provider_subscription_id" text,
  "status" text NOT NULL DEFAULT 'created'::text,
  "created_at" timestamp with time zone NOT NULL DEFAULT now(),
  "updated_at" timestamp with time zone NOT NULL DEFAULT now(),
  PRIMARY KEY ("id")
);

CREATE TABLE xrmovi.billing_ledger (
  "id" bigint NOT NULL,
  "account_id" uuid NOT NULL,
  "checkout_id" uuid NOT NULL,
  "provider" text NOT NULL,
  "event_id" text NOT NULL,
  "provider_payment_id" text,
  "amount_brl" numeric(10,2) NOT NULL,
  "confirmed_at" timestamp with time zone NOT NULL DEFAULT now(),
  PRIMARY KEY ("id")
);

CREATE TABLE xrmovi.pix_payment_intents (
  "id" uuid NOT NULL DEFAULT gen_random_uuid(),
  "account_id" uuid NOT NULL,
  "company_id" uuid NOT NULL,
  "plan_code" text NOT NULL,
  "amount_brl" numeric(12,2) NOT NULL,
  "status" text NOT NULL DEFAULT 'created'::text,
  "provider_payment_id" text,
  "expires_at" timestamp with time zone NOT NULL DEFAULT (now() + '00:30:00'::interval),
  "paid_at" timestamp with time zone,
  "created_at" timestamp with time zone NOT NULL DEFAULT now(),
  "updated_at" timestamp with time zone NOT NULL DEFAULT now(),
  PRIMARY KEY ("id")
);

CREATE TABLE xrmovi.manual_access_grants (
  "account_id" uuid NOT NULL,
  "valid_until" timestamp with time zone NOT NULL,
  "reason" text NOT NULL,
  "granted_by" uuid NOT NULL,
  "granted_at" timestamp with time zone NOT NULL DEFAULT now(),
  "revoked_at" timestamp with time zone,
  "revoked_by" uuid,
  PRIMARY KEY ("account_id")
);

CREATE TABLE xrmovi.client_access (
  "account_id" uuid NOT NULL,
  "blocked" boolean NOT NULL DEFAULT false,
  "reason" text,
  "changed_by" uuid,
  "changed_at" timestamp with time zone NOT NULL DEFAULT now(),
  PRIMARY KEY ("account_id")
);

