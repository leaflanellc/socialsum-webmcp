CREATE TABLE `agent_sessions` (
	`id` text PRIMARY KEY NOT NULL,
	`room_id` text NOT NULL,
	`owner_user_id` text NOT NULL,
	`agent_name` text NOT NULL,
	`scopes_json` text DEFAULT '[]' NOT NULL,
	`status` text DEFAULT 'active' NOT NULL,
	`expires_at` integer NOT NULL,
	`last_seen_at` integer,
	`created_at` integer NOT NULL,
	FOREIGN KEY (`room_id`) REFERENCES `rooms`(`id`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
CREATE INDEX `idx_agent_sessions_room_status` ON `agent_sessions` (`room_id`,`status`);--> statement-breakpoint
CREATE TABLE `approval_requests` (
	`id` text PRIMARY KEY NOT NULL,
	`room_id` text NOT NULL,
	`requested_by` text NOT NULL,
	`requested_by_name` text NOT NULL,
	`agent_session_id` text,
	`action_type` text NOT NULL,
	`payload_json` text DEFAULT '{}' NOT NULL,
	`rationale` text NOT NULL,
	`status` text DEFAULT 'pending' NOT NULL,
	`resolved_by` text,
	`resolved_at` integer,
	`created_at` integer NOT NULL,
	`idempotency_key` text,
	FOREIGN KEY (`room_id`) REFERENCES `rooms`(`id`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
CREATE INDEX `idx_approvals_room_status` ON `approval_requests` (`room_id`,`status`);--> statement-breakpoint
CREATE UNIQUE INDEX `idx_approvals_room_idempotency` ON `approval_requests` (`room_id`,`idempotency_key`);--> statement-breakpoint
CREATE TABLE `deliberation_items` (
	`id` text PRIMARY KEY NOT NULL,
	`room_id` text NOT NULL,
	`author_user_id` text NOT NULL,
	`author_name` text NOT NULL,
	`item_type` text NOT NULL,
	`title` text NOT NULL,
	`body` text NOT NULL,
	`status` text DEFAULT 'open' NOT NULL,
	`visibility` text DEFAULT 'published' NOT NULL,
	`related_item_id` text,
	`source_count` integer DEFAULT 0 NOT NULL,
	`actor_path` text DEFAULT 'human' NOT NULL,
	`created_at` integer NOT NULL,
	`updated_at` integer NOT NULL,
	`idempotency_key` text,
	FOREIGN KEY (`room_id`) REFERENCES `rooms`(`id`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
CREATE INDEX `idx_deliberation_room_type_status` ON `deliberation_items` (`room_id`,`item_type`,`status`);--> statement-breakpoint
CREATE UNIQUE INDEX `idx_deliberation_room_idempotency` ON `deliberation_items` (`room_id`,`idempotency_key`);--> statement-breakpoint
CREATE TABLE `reminders` (
	`id` text PRIMARY KEY NOT NULL,
	`room_id` text NOT NULL,
	`requirement_id` text,
	`recipient_user_id` text,
	`kind` text NOT NULL,
	`status` text DEFAULT 'scheduled' NOT NULL,
	`due_at` integer NOT NULL,
	`created_at` integer NOT NULL,
	`sent_at` integer,
	FOREIGN KEY (`room_id`) REFERENCES `rooms`(`id`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
CREATE INDEX `idx_reminders_room_due` ON `reminders` (`room_id`,`due_at`);--> statement-breakpoint
ALTER TABLE `rooms` ADD `version` integer DEFAULT 1 NOT NULL;--> statement-breakpoint
ALTER TABLE `rooms` ADD `meeting_avoided` integer DEFAULT false NOT NULL;
