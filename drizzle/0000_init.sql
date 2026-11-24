CREATE TABLE "companies" (
	"id" serial PRIMARY KEY NOT NULL,
	"name" text NOT NULL,
	"ats" text NOT NULL,
	"board" text NOT NULL,
	"active" boolean DEFAULT true NOT NULL,
	"source" text DEFAULT 'curated' NOT NULL,
	"last_checked_at" timestamp with time zone,
	"last_error" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "jobs" (
	"id" serial PRIMARY KEY NOT NULL,
	"company_id" integer NOT NULL,
	"external_id" text NOT NULL,
	"title" text NOT NULL,
	"location" text DEFAULT '' NOT NULL,
	"url" text NOT NULL,
	"description" text,
	"posted_at" timestamp with time zone,
	"first_seen_at" timestamp with time zone DEFAULT now() NOT NULL,
	"last_seen_at" timestamp with time zone DEFAULT now() NOT NULL,
	"closed" boolean DEFAULT false NOT NULL
);
--> statement-breakpoint
CREATE TABLE "matches" (
	"profile_id" text NOT NULL,
	"job_id" integer NOT NULL,
	"stage" text NOT NULL,
	"filter_reason" text,
	"score" integer,
	"reasons" text,
	"scorer" text,
	"scored_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "matches_profile_id_job_id_pk" PRIMARY KEY("profile_id","job_id")
);
--> statement-breakpoint
CREATE TABLE "runs" (
	"id" serial PRIMARY KEY NOT NULL,
	"started_at" timestamp with time zone DEFAULT now() NOT NULL,
	"finished_at" timestamp with time zone,
	"stats" jsonb,
	"error" text
);
--> statement-breakpoint
ALTER TABLE "jobs" ADD CONSTRAINT "jobs_company_id_companies_id_fk" FOREIGN KEY ("company_id") REFERENCES "public"."companies"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "matches" ADD CONSTRAINT "matches_job_id_jobs_id_fk" FOREIGN KEY ("job_id") REFERENCES "public"."jobs"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX "companies_ats_board" ON "companies" USING btree ("ats","board");--> statement-breakpoint
CREATE UNIQUE INDEX "jobs_company_external" ON "jobs" USING btree ("company_id","external_id");