ALTER TABLE `store_credentials` MODIFY COLUMN `expires_at` datetime(3) NOT NULL;--> statement-breakpoint
ALTER TABLE `store_credentials` MODIFY COLUMN `refresh_token` varchar(255) NOT NULL;--> statement-breakpoint
ALTER TABLE `store_credentials` MODIFY COLUMN `refresh_token_expires_at` datetime(3) NOT NULL;