CREATE TABLE `suite_cases` (
	`id` text PRIMARY KEY NOT NULL,
	`suite_id` text NOT NULL,
	`case_id` text NOT NULL,
	`ordinal` integer DEFAULT 0 NOT NULL,
	FOREIGN KEY (`suite_id`) REFERENCES `suites`(`id`) ON UPDATE no action ON DELETE no action,
	FOREIGN KEY (`case_id`) REFERENCES `test_cases`(`id`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
CREATE INDEX `suite_cases_suite_idx` ON `suite_cases` (`suite_id`);--> statement-breakpoint
CREATE INDEX `suite_cases_case_idx` ON `suite_cases` (`case_id`);--> statement-breakpoint
ALTER TABLE `suites` ADD `description` text;