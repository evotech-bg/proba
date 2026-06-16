CREATE TABLE `tasks` (
	`id` text PRIMARY KEY NOT NULL,
	`title` text NOT NULL,
	`description` text,
	`status` text DEFAULT 'todo' NOT NULL,
	`board_order` real DEFAULT 0 NOT NULL,
	`priority` integer,
	`assignee` text,
	`session_id` text,
	`case_id` text,
	`run_id` text,
	`requirement_id` text,
	`tracker` text DEFAULT 'embedded' NOT NULL,
	`external_ref` text,
	`external_url` text,
	`synced_at` integer,
	`created_at` integer NOT NULL,
	`updated_at` integer NOT NULL,
	FOREIGN KEY (`session_id`) REFERENCES `sessions`(`id`) ON UPDATE no action ON DELETE no action,
	FOREIGN KEY (`case_id`) REFERENCES `test_cases`(`id`) ON UPDATE no action ON DELETE no action,
	FOREIGN KEY (`run_id`) REFERENCES `test_runs`(`id`) ON UPDATE no action ON DELETE no action,
	FOREIGN KEY (`requirement_id`) REFERENCES `requirements`(`id`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
CREATE INDEX `tasks_status_idx` ON `tasks` (`status`);--> statement-breakpoint
CREATE INDEX `tasks_tracker_idx` ON `tasks` (`tracker`,`external_ref`);--> statement-breakpoint
ALTER TABLE `artifacts` ADD `task_id` text;--> statement-breakpoint
CREATE INDEX `artifacts_task_idx` ON `artifacts` (`task_id`);