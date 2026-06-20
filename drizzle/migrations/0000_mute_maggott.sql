CREATE TABLE `notifications` (
	`id` varchar(191) NOT NULL,
	`user_id` varchar(191) NOT NULL,
	`task_id` varchar(191) NOT NULL,
	`type` enum('TASK_ASSIGNED','TASK_COMPLETED','QA_REVIEWED','READY_FOR_ASSIGNMENT','TIME_EXCEEDED','HELP_REQUEST','TASK_APPROVED','TASK_REWORK','TASK_RESUBMITTED') NOT NULL,
	`is_read` boolean NOT NULL DEFAULT false,
	`created_at` timestamp NOT NULL DEFAULT CURRENT_TIMESTAMP,
	CONSTRAINT `notifications_id` PRIMARY KEY(`id`)
);
--> statement-breakpoint
CREATE TABLE `projects` (
	`id` varchar(191) NOT NULL,
	`name` varchar(255) NOT NULL,
	`client_name` varchar(255),
	`website_url` varchar(255),
	`files` text,
	`fiverr_order_id` varchar(255),
	`status` enum('CLIENT','COMPLETED') NOT NULL,
	`created_by` varchar(191) NOT NULL,
	`created_at` timestamp NOT NULL DEFAULT CURRENT_TIMESTAMP,
	`updated_at` timestamp NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
	CONSTRAINT `projects_id` PRIMARY KEY(`id`)
);
--> statement-breakpoint
CREATE TABLE `task_notes` (
	`id` varchar(191) NOT NULL,
	`task_id` varchar(191) NOT NULL,
	`user_id` varchar(191) NOT NULL,
	`note` text NOT NULL,
	`note_type` enum('COMMENT','APPROVAL','REJECTION','FEEDBACK_IMAGE') NOT NULL,
	`metadata` text,
	`created_at` timestamp NOT NULL DEFAULT CURRENT_TIMESTAMP,
	CONSTRAINT `task_notes_id` PRIMARY KEY(`id`)
);
--> statement-breakpoint
CREATE TABLE `task_timers` (
	`id` varchar(191) NOT NULL,
	`task_id` varchar(191) NOT NULL,
	`start_time` timestamp NOT NULL,
	`end_time` timestamp,
	`duration_minutes` int,
	`is_rework` boolean NOT NULL DEFAULT false,
	`created_at` timestamp NOT NULL DEFAULT CURRENT_TIMESTAMP,
	CONSTRAINT `task_timers_id` PRIMARY KEY(`id`)
);
--> statement-breakpoint
CREATE TABLE `tasks` (
	`id` varchar(191) NOT NULL,
	`project_id` varchar(191) NOT NULL,
	`team_type` enum('DEVELOPER','DESIGNER','PROGRAMMER') NOT NULL,
	`title` varchar(255) NOT NULL,
	`description` text,
	`files` text,
	`priority` enum('LOW','MEDIUM','HIGH') NOT NULL,
	`assigned_by` varchar(191) NOT NULL,
	`assigned_to` varchar(191) NOT NULL,
	`qa_assigned_to` varchar(191),
	`qa_assigned_at` timestamp,
	`estimated_minutes` int,
	`status` enum('IN_PROGRESS','WAITING_FOR_QA','APPROVED','REWORK') NOT NULL,
	`started_at` timestamp,
	`completed_at` timestamp,
	`locked_at` timestamp,
	`rework_count` int NOT NULL DEFAULT 0,
	`created_at` timestamp NOT NULL DEFAULT CURRENT_TIMESTAMP,
	`updated_at` timestamp NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
	CONSTRAINT `tasks_id` PRIMARY KEY(`id`)
);
--> statement-breakpoint
CREATE TABLE `users` (
	`id` varchar(191) NOT NULL,
	`name` varchar(255) NOT NULL,
	`username` varchar(255) NOT NULL,
	`password` varchar(255) NOT NULL,
	`role` enum('ADMIN','PROJECT_MANAGER','TEAM_LEADER','DEVELOPER','DESIGNER','PROGRAMMER','QA') NOT NULL,
	`team_type` enum('DEVELOPER','DESIGNER','PROGRAMMER'),
	`team_leader_id` varchar(191),
	`is_active` boolean NOT NULL DEFAULT true,
	`created_at` timestamp NOT NULL DEFAULT CURRENT_TIMESTAMP,
	`updated_at` timestamp NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
	CONSTRAINT `users_id` PRIMARY KEY(`id`),
	CONSTRAINT `users_username_unique` UNIQUE(`username`)
);
--> statement-breakpoint
ALTER TABLE `notifications` ADD CONSTRAINT `notifications_user_id_users_id_fk` FOREIGN KEY (`user_id`) REFERENCES `users`(`id`) ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE `notifications` ADD CONSTRAINT `notifications_task_id_tasks_id_fk` FOREIGN KEY (`task_id`) REFERENCES `tasks`(`id`) ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE `projects` ADD CONSTRAINT `projects_created_by_users_id_fk` FOREIGN KEY (`created_by`) REFERENCES `users`(`id`) ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE `task_notes` ADD CONSTRAINT `task_notes_task_id_tasks_id_fk` FOREIGN KEY (`task_id`) REFERENCES `tasks`(`id`) ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE `task_notes` ADD CONSTRAINT `task_notes_user_id_users_id_fk` FOREIGN KEY (`user_id`) REFERENCES `users`(`id`) ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE `task_timers` ADD CONSTRAINT `task_timers_task_id_tasks_id_fk` FOREIGN KEY (`task_id`) REFERENCES `tasks`(`id`) ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE `tasks` ADD CONSTRAINT `tasks_project_id_projects_id_fk` FOREIGN KEY (`project_id`) REFERENCES `projects`(`id`) ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE `tasks` ADD CONSTRAINT `tasks_assigned_by_users_id_fk` FOREIGN KEY (`assigned_by`) REFERENCES `users`(`id`) ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE `tasks` ADD CONSTRAINT `tasks_assigned_to_users_id_fk` FOREIGN KEY (`assigned_to`) REFERENCES `users`(`id`) ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE `tasks` ADD CONSTRAINT `tasks_qa_assigned_to_users_id_fk` FOREIGN KEY (`qa_assigned_to`) REFERENCES `users`(`id`) ON DELETE no action ON UPDATE no action;--> statement-breakpoint
CREATE INDEX `notifications_user_idx` ON `notifications` (`user_id`);--> statement-breakpoint
CREATE INDEX `notifications_task_idx` ON `notifications` (`task_id`);--> statement-breakpoint
CREATE INDEX `projects_created_by_idx` ON `projects` (`created_by`);--> statement-breakpoint
CREATE INDEX `task_notes_task_idx` ON `task_notes` (`task_id`);--> statement-breakpoint
CREATE INDEX `task_notes_user_idx` ON `task_notes` (`user_id`);--> statement-breakpoint
CREATE INDEX `task_timers_task_idx` ON `task_timers` (`task_id`);--> statement-breakpoint
CREATE INDEX `tasks_project_idx` ON `tasks` (`project_id`);--> statement-breakpoint
CREATE INDEX `tasks_assigned_to_idx` ON `tasks` (`assigned_to`);--> statement-breakpoint
CREATE INDEX `tasks_assigned_by_idx` ON `tasks` (`assigned_by`);