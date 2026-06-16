CREATE TABLE `apps` (
	`id` text PRIMARY KEY NOT NULL,
	`key` text NOT NULL,
	`project_key` text NOT NULL,
	`name` text NOT NULL,
	`platform` text,
	`created_at` integer NOT NULL
);
--> statement-breakpoint
CREATE UNIQUE INDEX `apps_key_unique` ON `apps` (`key`);--> statement-breakpoint
CREATE INDEX `apps_project_idx` ON `apps` (`project_key`);--> statement-breakpoint
CREATE TABLE `projects` (
	`id` text PRIMARY KEY NOT NULL,
	`key` text NOT NULL,
	`name` text NOT NULL,
	`description` text,
	`created_at` integer NOT NULL
);
--> statement-breakpoint
CREATE UNIQUE INDEX `projects_key_unique` ON `projects` (`key`);--> statement-breakpoint
ALTER TABLE `requirements` ADD `app_key` text;--> statement-breakpoint
ALTER TABLE `suites` ADD `app_key` text;--> statement-breakpoint
ALTER TABLE `tasks` ADD `app_key` text;--> statement-breakpoint
ALTER TABLE `test_cases` ADD `app_key` text;