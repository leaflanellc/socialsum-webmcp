CREATE TABLE `agent_work_sessions` (
	`id` text PRIMARY KEY NOT NULL,
	`agent_session_id` text NOT NULL,
	`room_id` text NOT NULL,
	`owner_user_id` text NOT NULL,
	`status` text DEFAULT 'active' NOT NULL,
	`previous_checkpoint_id` text,
	`started_at` integer NOT NULL,
	`last_activity_at` integer NOT NULL,
	`closed_at` integer,
	FOREIGN KEY (`agent_session_id`) REFERENCES `agent_sessions`(`id`) ON UPDATE no action ON DELETE no action,
	FOREIGN KEY (`room_id`) REFERENCES `rooms`(`id`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
CREATE INDEX `idx_agent_work_sessions_agent_status` ON `agent_work_sessions` (`agent_session_id`,`status`);--> statement-breakpoint
CREATE INDEX `idx_agent_work_sessions_room_started` ON `agent_work_sessions` (`room_id`,`started_at`);--> statement-breakpoint
CREATE TABLE `agent_event_receipts` (
	`id` text PRIMARY KEY NOT NULL,
	`agent_session_id` text NOT NULL,
	`work_session_id` text NOT NULL,
	`event_id` text NOT NULL,
	`state` text DEFAULT 'delivered' NOT NULL,
	`delivered_at` integer NOT NULL,
	`updated_at` integer NOT NULL,
	FOREIGN KEY (`agent_session_id`) REFERENCES `agent_sessions`(`id`) ON UPDATE no action ON DELETE no action,
	FOREIGN KEY (`work_session_id`) REFERENCES `agent_work_sessions`(`id`) ON UPDATE no action ON DELETE no action,
	FOREIGN KEY (`event_id`) REFERENCES `activity_events`(`id`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
CREATE UNIQUE INDEX `idx_agent_event_receipts_work_event` ON `agent_event_receipts` (`work_session_id`,`event_id`);--> statement-breakpoint
CREATE INDEX `idx_agent_event_receipts_work_state` ON `agent_event_receipts` (`work_session_id`,`state`);--> statement-breakpoint
CREATE TABLE `agent_checkpoints` (
	`id` text PRIMARY KEY NOT NULL,
	`agent_session_id` text NOT NULL,
	`work_session_id` text NOT NULL,
	`room_id` text NOT NULL,
	`owner_user_id` text NOT NULL,
	`acknowledged_through_event_id` text,
	`acknowledged_through_at` integer,
	`summary` text NOT NULL,
	`assumptions_json` text DEFAULT '[]' NOT NULL,
	`commitments_json` text DEFAULT '[]' NOT NULL,
	`deferred_event_ids_json` text DEFAULT '[]' NOT NULL,
	`created_at` integer NOT NULL,
	FOREIGN KEY (`agent_session_id`) REFERENCES `agent_sessions`(`id`) ON UPDATE no action ON DELETE no action,
	FOREIGN KEY (`work_session_id`) REFERENCES `agent_work_sessions`(`id`) ON UPDATE no action ON DELETE no action,
	FOREIGN KEY (`room_id`) REFERENCES `rooms`(`id`) ON UPDATE no action ON DELETE no action,
	FOREIGN KEY (`acknowledged_through_event_id`) REFERENCES `activity_events`(`id`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
CREATE INDEX `idx_agent_checkpoints_agent_created` ON `agent_checkpoints` (`agent_session_id`,`created_at`);--> statement-breakpoint
CREATE INDEX `idx_agent_checkpoints_room_created` ON `agent_checkpoints` (`room_id`,`created_at`);
