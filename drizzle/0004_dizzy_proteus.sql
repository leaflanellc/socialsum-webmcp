CREATE TABLE `change_set_changes` (
	`id` text PRIMARY KEY NOT NULL,
	`change_set_id` text NOT NULL,
	`position` integer NOT NULL,
	`change_type` text NOT NULL,
	`target_type` text NOT NULL,
	`target_id` text,
	`field_name` text,
	`before_json` text DEFAULT 'null' NOT NULL,
	`after_json` text NOT NULL,
	FOREIGN KEY (`change_set_id`) REFERENCES `change_sets`(`id`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
CREATE UNIQUE INDEX `idx_change_set_changes_position` ON `change_set_changes` (`change_set_id`,`position`);--> statement-breakpoint
CREATE TABLE `change_set_reviews` (
	`id` text PRIMARY KEY NOT NULL,
	`change_set_id` text NOT NULL,
	`reviewer_user_id` text NOT NULL,
	`reviewer_name` text NOT NULL,
	`verdict` text NOT NULL,
	`body` text DEFAULT '' NOT NULL,
	`reviewed_revision` integer NOT NULL,
	`created_at` integer NOT NULL,
	`updated_at` integer NOT NULL,
	FOREIGN KEY (`change_set_id`) REFERENCES `change_sets`(`id`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
CREATE UNIQUE INDEX `idx_change_set_reviews_reviewer_revision` ON `change_set_reviews` (`change_set_id`,`reviewer_user_id`,`reviewed_revision`);--> statement-breakpoint
CREATE TABLE `change_set_threads` (
	`id` text PRIMARY KEY NOT NULL,
	`change_set_id` text NOT NULL,
	`change_id` text,
	`author_user_id` text NOT NULL,
	`author_name` text NOT NULL,
	`body` text NOT NULL,
	`status` text DEFAULT 'open' NOT NULL,
	`created_at` integer NOT NULL,
	`resolved_at` integer,
	`resolved_by` text,
	FOREIGN KEY (`change_set_id`) REFERENCES `change_sets`(`id`) ON UPDATE no action ON DELETE no action,
	FOREIGN KEY (`change_id`) REFERENCES `change_set_changes`(`id`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
CREATE INDEX `idx_change_set_threads_status` ON `change_set_threads` (`change_set_id`,`status`);--> statement-breakpoint
CREATE TABLE `change_sets` (
	`id` text PRIMARY KEY NOT NULL,
	`room_id` text NOT NULL,
	`base_version` integer NOT NULL,
	`revision` integer DEFAULT 1 NOT NULL,
	`title` text NOT NULL,
	`summary` text NOT NULL,
	`status` text DEFAULT 'draft' NOT NULL,
	`author_user_id` text NOT NULL,
	`author_name` text NOT NULL,
	`actor_path` text DEFAULT 'human' NOT NULL,
	`agent_session_id` text,
	`idempotency_key` text,
	`created_at` integer NOT NULL,
	`updated_at` integer NOT NULL,
	`submitted_at` integer,
	`adopted_at` integer,
	`adopted_by` text,
	FOREIGN KEY (`room_id`) REFERENCES `rooms`(`id`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
CREATE INDEX `idx_change_sets_room_status` ON `change_sets` (`room_id`,`status`);--> statement-breakpoint
CREATE UNIQUE INDEX `idx_change_sets_room_idempotency` ON `change_sets` (`room_id`,`idempotency_key`);