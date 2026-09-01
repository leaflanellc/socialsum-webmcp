CREATE TABLE `decisions` (
	`id` text PRIMARY KEY NOT NULL,
	`room_id` text NOT NULL,
	`summary` text NOT NULL,
	`rationale` text NOT NULL,
	`dissent_json` text DEFAULT '[]' NOT NULL,
	`decided_by` text NOT NULL,
	`decided_at` integer NOT NULL,
	FOREIGN KEY (`room_id`) REFERENCES `rooms`(`id`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
CREATE UNIQUE INDEX `idx_decisions_room` ON `decisions` (`room_id`);--> statement-breakpoint
CREATE TABLE `requirements` (
	`id` text PRIMARY KEY NOT NULL,
	`room_id` text NOT NULL,
	`title` text NOT NULL,
	`description` text NOT NULL,
	`owner_label` text NOT NULL,
	`owner_user_id` text,
	`kind` text DEFAULT 'input' NOT NULL,
	`required` integer DEFAULT true NOT NULL,
	`status` text DEFAULT 'open' NOT NULL,
	`due_at` integer,
	`contribution_id` text,
	`created_at` integer NOT NULL,
	`updated_at` integer NOT NULL,
	FOREIGN KEY (`room_id`) REFERENCES `rooms`(`id`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
CREATE INDEX `idx_requirements_room_status` ON `requirements` (`room_id`,`status`);--> statement-breakpoint
ALTER TABLE `activity_events` ADD `actor_name` text DEFAULT 'Participant' NOT NULL;--> statement-breakpoint
CREATE INDEX `idx_activity_room_created` ON `activity_events` (`room_id`,`created_at`);--> statement-breakpoint
ALTER TABLE `contributions` ADD `author_name` text DEFAULT 'Participant' NOT NULL;--> statement-breakpoint
CREATE INDEX `idx_contributions_room_visibility` ON `contributions` (`room_id`,`visibility`);--> statement-breakpoint
ALTER TABLE `rooms` ADD `desired_outcome` text DEFAULT '' NOT NULL;--> statement-breakpoint
CREATE INDEX `idx_rooms_workspace_status` ON `rooms` (`workspace_id`,`status`);--> statement-breakpoint
CREATE INDEX `idx_rooms_deadline` ON `rooms` (`deadline_at`);--> statement-breakpoint
CREATE UNIQUE INDEX `idx_memberships_room_user` ON `memberships` (`room_id`,`user_id`);--> statement-breakpoint
CREATE INDEX `idx_outcomes_room` ON `outcome_reviews` (`room_id`);--> statement-breakpoint
CREATE UNIQUE INDEX `idx_phases_room_position` ON `phases` (`room_id`,`position`);
