CREATE TABLE `room_invitations` (
	`id` text PRIMARY KEY NOT NULL,
	`room_id` text NOT NULL,
	`invited_email` text NOT NULL,
	`role` text DEFAULT 'contributor' NOT NULL,
	`status` text DEFAULT 'pending' NOT NULL,
	`invited_by` text NOT NULL,
	`created_at` integer NOT NULL,
	`accepted_at` integer,
	FOREIGN KEY (`room_id`) REFERENCES `rooms`(`id`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
CREATE UNIQUE INDEX `idx_invitations_room_email` ON `room_invitations` (`room_id`,`invited_email`);
--> statement-breakpoint
CREATE INDEX `idx_invitations_email_status` ON `room_invitations` (`invited_email`,`status`);
--> statement-breakpoint
CREATE TABLE `attachments` (
	`id` text PRIMARY KEY NOT NULL,
	`room_id` text NOT NULL,
	`contribution_id` text,
	`uploaded_by` text NOT NULL,
	`uploaded_by_name` text NOT NULL,
	`filename` text NOT NULL,
	`content_type` text NOT NULL,
	`size_bytes` integer NOT NULL,
	`r2_key` text NOT NULL,
	`status` text DEFAULT 'ready' NOT NULL,
	`created_at` integer NOT NULL,
	FOREIGN KEY (`room_id`) REFERENCES `rooms`(`id`) ON UPDATE no action ON DELETE no action,
	FOREIGN KEY (`contribution_id`) REFERENCES `contributions`(`id`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
CREATE INDEX `idx_attachments_room_created` ON `attachments` (`room_id`,`created_at`);
--> statement-breakpoint
CREATE UNIQUE INDEX `idx_attachments_r2_key` ON `attachments` (`r2_key`);
