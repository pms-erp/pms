ALTER TABLE `notifications` ADD `title` varchar(255);--> statement-breakpoint
ALTER TABLE `notifications` ADD `message` text;--> statement-breakpoint
ALTER TABLE `tasks` DROP COLUMN `order`;