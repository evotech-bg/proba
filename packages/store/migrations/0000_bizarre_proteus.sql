CREATE TABLE `artifacts` (
	`id` text PRIMARY KEY NOT NULL,
	`result_id` text,
	`step_id` text,
	`type` text NOT NULL,
	`path` text NOT NULL,
	`meta` text,
	`created_at` integer NOT NULL,
	FOREIGN KEY (`result_id`) REFERENCES `results`(`id`) ON UPDATE no action ON DELETE no action,
	FOREIGN KEY (`step_id`) REFERENCES `steps`(`id`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
CREATE INDEX `artifacts_result_idx` ON `artifacts` (`result_id`);--> statement-breakpoint
CREATE TABLE `assertions` (
	`id` text PRIMARY KEY NOT NULL,
	`step_id` text NOT NULL,
	`type` text NOT NULL,
	`spec` text NOT NULL,
	`description` text,
	FOREIGN KEY (`step_id`) REFERENCES `steps`(`id`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
CREATE INDEX `assertions_step_idx` ON `assertions` (`step_id`);--> statement-breakpoint
CREATE TABLE `baselines` (
	`id` text PRIMARY KEY NOT NULL,
	`name` text NOT NULL,
	`branch` text DEFAULT 'main' NOT NULL,
	`path` text NOT NULL,
	`config` text,
	`approved_at` integer,
	`created_at` integer NOT NULL
);
--> statement-breakpoint
CREATE INDEX `baselines_name_branch_idx` ON `baselines` (`name`,`branch`);--> statement-breakpoint
CREATE TABLE `defects` (
	`id` text PRIMARY KEY NOT NULL,
	`external_ref` text,
	`title` text NOT NULL,
	`result_id` text,
	`requirement_id` text,
	`status` text,
	`created_at` integer NOT NULL,
	FOREIGN KEY (`result_id`) REFERENCES `results`(`id`) ON UPDATE no action ON DELETE no action,
	FOREIGN KEY (`requirement_id`) REFERENCES `requirements`(`id`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
CREATE TABLE `flaky_records` (
	`id` text PRIMARY KEY NOT NULL,
	`case_id` text NOT NULL,
	`score` real DEFAULT 0 NOT NULL,
	`root_cause` text DEFAULT 'unknown' NOT NULL,
	`quarantined` integer DEFAULT false NOT NULL,
	`sla_due_at` integer,
	`last_seen_at` integer,
	FOREIGN KEY (`case_id`) REFERENCES `test_cases`(`id`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
CREATE UNIQUE INDEX `flaky_records_case_id_unique` ON `flaky_records` (`case_id`);--> statement-breakpoint
CREATE TABLE `knowledge` (
	`id` text PRIMARY KEY NOT NULL,
	`app_key` text NOT NULL,
	`session_id` text,
	`kind` text NOT NULL,
	`key` text NOT NULL,
	`value` text NOT NULL,
	`confidence` real DEFAULT 0.5 NOT NULL,
	`observed_at` integer NOT NULL,
	FOREIGN KEY (`session_id`) REFERENCES `sessions`(`id`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
CREATE INDEX `knowledge_app_idx` ON `knowledge` (`app_key`,`kind`);--> statement-breakpoint
CREATE INDEX `knowledge_key_idx` ON `knowledge` (`app_key`,`key`);--> statement-breakpoint
CREATE TABLE `plans` (
	`id` text PRIMARY KEY NOT NULL,
	`strategy_id` text,
	`title` text NOT NULL,
	`scope` text,
	`environment` text,
	`created_at` integer NOT NULL,
	FOREIGN KEY (`strategy_id`) REFERENCES `strategies`(`id`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
CREATE TABLE `requirements` (
	`id` text PRIMARY KEY NOT NULL,
	`key` text NOT NULL,
	`title` text NOT NULL,
	`as_a` text,
	`i_want` text,
	`so_that` text,
	`description` text,
	`created_at` integer NOT NULL,
	`updated_at` integer NOT NULL
);
--> statement-breakpoint
CREATE TABLE `results` (
	`id` text PRIMARY KEY NOT NULL,
	`run_id` text NOT NULL,
	`case_id` text NOT NULL,
	`step_id` text,
	`verdict` text NOT NULL,
	`duration_ms` integer,
	`message` text,
	`executed_at` integer NOT NULL,
	FOREIGN KEY (`run_id`) REFERENCES `test_runs`(`id`) ON UPDATE no action ON DELETE no action,
	FOREIGN KEY (`case_id`) REFERENCES `test_cases`(`id`) ON UPDATE no action ON DELETE no action,
	FOREIGN KEY (`step_id`) REFERENCES `steps`(`id`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
CREATE INDEX `results_run_idx` ON `results` (`run_id`);--> statement-breakpoint
CREATE INDEX `results_case_idx` ON `results` (`case_id`);--> statement-breakpoint
CREATE TABLE `sessions` (
	`id` text PRIMARY KEY NOT NULL,
	`app_key` text NOT NULL,
	`charter` text,
	`timebox_mins` integer,
	`status` text DEFAULT 'open',
	`notes` text,
	`metrics` text,
	`started_at` integer NOT NULL,
	`ended_at` integer
);
--> statement-breakpoint
CREATE TABLE `steps` (
	`id` text PRIMARY KEY NOT NULL,
	`case_id` text NOT NULL,
	`ordinal` integer NOT NULL,
	`kind` text NOT NULL,
	`action` text NOT NULL,
	`target` text,
	`params` text,
	`description` text,
	FOREIGN KEY (`case_id`) REFERENCES `test_cases`(`id`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
CREATE INDEX `steps_case_idx` ON `steps` (`case_id`,`ordinal`);--> statement-breakpoint
CREATE TABLE `strategies` (
	`id` text PRIMARY KEY NOT NULL,
	`title` text NOT NULL,
	`description` text,
	`created_at` integer NOT NULL
);
--> statement-breakpoint
CREATE TABLE `suites` (
	`id` text PRIMARY KEY NOT NULL,
	`plan_id` text,
	`parent_id` text,
	`name` text NOT NULL,
	`kind` text,
	`created_at` integer NOT NULL,
	FOREIGN KEY (`plan_id`) REFERENCES `plans`(`id`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
CREATE TABLE `test_cases` (
	`id` text PRIMARY KEY NOT NULL,
	`suite_id` text,
	`title` text NOT NULL,
	`intent` text,
	`polarity` text DEFAULT 'positive' NOT NULL,
	`technique` text DEFAULT 'manual' NOT NULL,
	`lifecycle` text DEFAULT 'draft' NOT NULL,
	`priority` integer,
	`risk_likelihood` integer,
	`risk_impact` integer,
	`preconditions` text,
	`tags` text,
	`created_at` integer NOT NULL,
	`updated_at` integer NOT NULL,
	FOREIGN KEY (`suite_id`) REFERENCES `suites`(`id`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
CREATE INDEX `test_cases_suite_idx` ON `test_cases` (`suite_id`);--> statement-breakpoint
CREATE TABLE `test_runs` (
	`id` text PRIMARY KEY NOT NULL,
	`build_ref` text,
	`environment` text,
	`started_at` integer NOT NULL,
	`finished_at` integer,
	`meta` text
);
--> statement-breakpoint
CREATE TABLE `trace_links` (
	`id` text PRIMARY KEY NOT NULL,
	`requirement_id` text,
	`case_id` text,
	`link_type` text DEFAULT 'covers' NOT NULL,
	`created_at` integer NOT NULL,
	FOREIGN KEY (`requirement_id`) REFERENCES `requirements`(`id`) ON UPDATE no action ON DELETE no action,
	FOREIGN KEY (`case_id`) REFERENCES `test_cases`(`id`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
CREATE INDEX `trace_req_idx` ON `trace_links` (`requirement_id`);--> statement-breakpoint
CREATE INDEX `trace_case_idx` ON `trace_links` (`case_id`);