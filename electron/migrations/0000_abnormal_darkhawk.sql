CREATE TABLE `browsers` (
	`id` text PRIMARY KEY NOT NULL,
	`name` text NOT NULL,
	`engine` text NOT NULL,
	`executable_path` text NOT NULL,
	`version` text NOT NULL,
	`is_default` integer DEFAULT false NOT NULL,
	`is_custom` integer DEFAULT false NOT NULL,
	`detected_at` integer,
	`status` text DEFAULT 'available' NOT NULL,
	`created_at` integer NOT NULL,
	`updated_at` integer NOT NULL
);
--> statement-breakpoint
CREATE INDEX `idx_browsers_engine` ON `browsers` (`engine`);--> statement-breakpoint
CREATE INDEX `idx_browsers_status` ON `browsers` (`status`);--> statement-breakpoint
CREATE TABLE `profile_groups` (
	`id` text PRIMARY KEY NOT NULL,
	`name` text NOT NULL,
	`color` text DEFAULT '#6366f1' NOT NULL,
	`description` text,
	`sort_order` integer DEFAULT 0 NOT NULL,
	`created_at` integer NOT NULL,
	`updated_at` integer NOT NULL
);
--> statement-breakpoint
CREATE TABLE `profile_tags` (
	`profile_id` text NOT NULL,
	`tag_id` text NOT NULL,
	PRIMARY KEY(`profile_id`, `tag_id`)
);
--> statement-breakpoint
CREATE INDEX `idx_profile_tags_tag_id` ON `profile_tags` (`tag_id`);--> statement-breakpoint
CREATE TABLE `tags` (
	`id` text PRIMARY KEY NOT NULL,
	`name` text NOT NULL,
	`color` text DEFAULT '#10b981' NOT NULL,
	`created_at` integer NOT NULL
);
--> statement-breakpoint
CREATE UNIQUE INDEX `tags_name_unique` ON `tags` (`name`);--> statement-breakpoint
CREATE TABLE `proxies` (
	`id` text PRIMARY KEY NOT NULL,
	`name` text NOT NULL,
	`protocol` text DEFAULT 'http' NOT NULL,
	`host` text NOT NULL,
	`port` integer NOT NULL,
	`username` text,
	`encrypted_password` text,
	`change_ip_url` text,
	`status` text DEFAULT 'untested' NOT NULL,
	`latency` integer,
	`ip_info` text,
	`last_checked_at` integer,
	`created_at` integer NOT NULL,
	`updated_at` integer NOT NULL
);
--> statement-breakpoint
CREATE INDEX `idx_proxies_status` ON `proxies` (`status`);--> statement-breakpoint
CREATE INDEX `idx_proxies_host_port` ON `proxies` (`host`,`port`);--> statement-breakpoint
CREATE TABLE `profiles` (
	`id` text PRIMARY KEY NOT NULL,
	`name` text NOT NULL,
	`group_id` text,
	`browser_id` text NOT NULL,
	`proxy_id` text,
	`os` text DEFAULT 'windows' NOT NULL,
	`user_agent` text,
	`viewport_width` integer DEFAULT 1280 NOT NULL,
	`viewport_height` integer DEFAULT 720 NOT NULL,
	`timezone` text DEFAULT 'Asia/Ho_Chi_Minh' NOT NULL,
	`locale` text DEFAULT 'vi-VN' NOT NULL,
	`webrtc_mode` text DEFAULT 'default' NOT NULL,
	`canvas_mode` text DEFAULT 'default' NOT NULL,
	`audio_mode` text DEFAULT 'default' NOT NULL,
	`webgl_mode` text DEFAULT 'default' NOT NULL,
	`storage_path` text NOT NULL,
	`custom_flags` text DEFAULT '[]' NOT NULL,
	`notes` text,
	`is_archived` integer DEFAULT false NOT NULL,
	`last_launched_at` integer,
	`created_at` integer NOT NULL,
	`updated_at` integer NOT NULL,
	FOREIGN KEY (`group_id`) REFERENCES `profile_groups`(`id`) ON UPDATE no action ON DELETE set null,
	FOREIGN KEY (`browser_id`) REFERENCES `browsers`(`id`) ON UPDATE no action ON DELETE restrict,
	FOREIGN KEY (`proxy_id`) REFERENCES `proxies`(`id`) ON UPDATE no action ON DELETE set null
);
--> statement-breakpoint
CREATE INDEX `idx_profiles_group_id` ON `profiles` (`group_id`);--> statement-breakpoint
CREATE INDEX `idx_profiles_browser_id` ON `profiles` (`browser_id`);--> statement-breakpoint
CREATE INDEX `idx_profiles_proxy_id` ON `profiles` (`proxy_id`);--> statement-breakpoint
CREATE INDEX `idx_profiles_is_archived` ON `profiles` (`is_archived`);--> statement-breakpoint
CREATE INDEX `idx_profiles_name` ON `profiles` (`name`);--> statement-breakpoint
CREATE TABLE `workflows` (
	`id` text PRIMARY KEY NOT NULL,
	`name` text NOT NULL,
	`description` text,
	`steps` text NOT NULL,
	`is_template` integer DEFAULT false NOT NULL,
	`created_at` integer NOT NULL,
	`updated_at` integer NOT NULL
);
--> statement-breakpoint
CREATE TABLE `tasks` (
	`id` text PRIMARY KEY NOT NULL,
	`profile_id` text,
	`workflow_id` text,
	`name` text NOT NULL,
	`type` text DEFAULT 'workflow' NOT NULL,
	`status` text DEFAULT 'pending' NOT NULL,
	`progress` integer DEFAULT 0 NOT NULL,
	`payload` text,
	`result` text,
	`error` text,
	`started_at` integer,
	`finished_at` integer,
	`created_at` integer NOT NULL,
	FOREIGN KEY (`profile_id`) REFERENCES `profiles`(`id`) ON UPDATE no action ON DELETE set null,
	FOREIGN KEY (`workflow_id`) REFERENCES `workflows`(`id`) ON UPDATE no action ON DELETE set null
);
--> statement-breakpoint
CREATE INDEX `idx_tasks_status` ON `tasks` (`status`);--> statement-breakpoint
CREATE INDEX `idx_tasks_profile_id` ON `tasks` (`profile_id`);--> statement-breakpoint
CREATE INDEX `idx_tasks_created_at` ON `tasks` (`created_at`);--> statement-breakpoint
CREATE TABLE `settings` (
	`id` text PRIMARY KEY NOT NULL,
	`key` text NOT NULL,
	`value` text NOT NULL,
	`is_encrypted` integer DEFAULT false NOT NULL,
	`updated_at` integer NOT NULL
);
--> statement-breakpoint
CREATE UNIQUE INDEX `settings_key_unique` ON `settings` (`key`);--> statement-breakpoint
CREATE TABLE `audit_logs` (
	`id` text PRIMARY KEY NOT NULL,
	`level` text DEFAULT 'info' NOT NULL,
	`category` text NOT NULL,
	`message` text NOT NULL,
	`details` text,
	`timestamp` integer NOT NULL
);
--> statement-breakpoint
CREATE INDEX `idx_audit_logs_timestamp` ON `audit_logs` (`timestamp`);--> statement-breakpoint
CREATE INDEX `idx_audit_logs_level` ON `audit_logs` (`level`);--> statement-breakpoint
CREATE INDEX `idx_audit_logs_category` ON `audit_logs` (`category`);