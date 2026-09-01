CREATE TABLE `activity_events` (
	`id` text PRIMARY KEY NOT NULL,
	`room_id` text NOT NULL,
	`actor_user_id` text NOT NULL,
	`actor_path` text DEFAULT 'human' NOT NULL,
	`action` text NOT NULL,
	`object_type` text NOT NULL,
	`object_id` text NOT NULL,
	`summary` text NOT NULL,
	`created_at` integer NOT NULL,
	FOREIGN KEY (`room_id`) REFERENCES `rooms`(`id`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
CREATE TABLE `contributions` (
	`id` text PRIMARY KEY NOT NULL,
	`room_id` text NOT NULL,
	`author_user_id` text NOT NULL,
	`type` text NOT NULL,
	`title` text NOT NULL,
	`body` text NOT NULL,
	`visibility` text DEFAULT 'private_draft' NOT NULL,
	`prepared_with_agent` integer DEFAULT false NOT NULL,
	`source_count` integer DEFAULT 0 NOT NULL,
	`created_at` integer NOT NULL,
	`published_at` integer,
	FOREIGN KEY (`room_id`) REFERENCES `rooms`(`id`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
CREATE TABLE `memberships` (
	`id` text PRIMARY KEY NOT NULL,
	`room_id` text NOT NULL,
	`user_id` text NOT NULL,
	`display_name` text NOT NULL,
	`role` text DEFAULT 'contributor' NOT NULL,
	`constitution_accepted_at` integer,
	`joined_at` integer NOT NULL,
	FOREIGN KEY (`room_id`) REFERENCES `rooms`(`id`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
CREATE TABLE `outcome_reviews` (
	`id` text PRIMARY KEY NOT NULL,
	`room_id` text NOT NULL,
	`goal_achievement` real,
	`evidence_quality` real,
	`process_integrity` real,
	`participation_health` real,
	`execution` real,
	`learning_value` real,
	`verification_level` text DEFAULT 'unreviewed' NOT NULL,
	`evidence_json` text DEFAULT '[]' NOT NULL,
	`dissent_json` text DEFAULT '[]' NOT NULL,
	`reviewed_at` integer NOT NULL,
	FOREIGN KEY (`room_id`) REFERENCES `rooms`(`id`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
CREATE TABLE `phases` (
	`id` text PRIMARY KEY NOT NULL,
	`room_id` text NOT NULL,
	`position` integer NOT NULL,
	`name` text NOT NULL,
	`status` text DEFAULT 'upcoming' NOT NULL,
	`starts_at` integer,
	`ends_at` integer,
	FOREIGN KEY (`room_id`) REFERENCES `rooms`(`id`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
CREATE TABLE `rooms` (
	`id` text PRIMARY KEY NOT NULL,
	`workspace_id` text NOT NULL,
	`title` text NOT NULL,
	`problem` text NOT NULL,
	`governance_model` text NOT NULL,
	`visibility` text DEFAULT 'invite_only' NOT NULL,
	`decision_authority` text NOT NULL,
	`constitution_json` text NOT NULL,
	`success_criteria_json` text NOT NULL,
	`status` text DEFAULT 'draft' NOT NULL,
	`current_phase` integer DEFAULT 0 NOT NULL,
	`deadline_at` integer,
	`outcome_review_at` integer,
	`created_by` text NOT NULL,
	`created_at` integer NOT NULL,
	`updated_at` integer NOT NULL,
	FOREIGN KEY (`workspace_id`) REFERENCES `workspaces`(`id`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
CREATE TABLE `workspaces` (
	`id` text PRIMARY KEY NOT NULL,
	`name` text NOT NULL,
	`owner_user_id` text NOT NULL,
	`created_at` integer NOT NULL
);
