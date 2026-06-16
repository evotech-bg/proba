CREATE TABLE `app_config` (
	`id` text PRIMARY KEY NOT NULL,
	`app_key` text NOT NULL,
	`type` text NOT NULL,
	`name` text NOT NULL,
	`data` text NOT NULL,
	`secret` integer DEFAULT false NOT NULL,
	`created_at` integer NOT NULL,
	`updated_at` integer NOT NULL
);
--> statement-breakpoint
CREATE INDEX `app_config_app_idx` ON `app_config` (`app_key`,`type`);--> statement-breakpoint
CREATE UNIQUE INDEX `app_config_uq` ON `app_config` (`app_key`,`type`,`name`);