CREATE TABLE `collection_products` (
	`collection_id` bigint unsigned NOT NULL,
	`product_id` bigint unsigned NOT NULL,
	`store_id` bigint unsigned NOT NULL,
	`position` int unsigned NOT NULL,
	`created_at` datetime(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
	`updated_at` datetime(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
	CONSTRAINT `collection_products_collection_id_product_id_pk` PRIMARY KEY(`collection_id`,`product_id`)
);
--> statement-breakpoint
CREATE TABLE `collections` (
	`id` bigint unsigned AUTO_INCREMENT NOT NULL,
	`store_id` bigint unsigned NOT NULL,
	`shopify_id` bigint unsigned NOT NULL,
	`title` varchar(255) NOT NULL,
	`handle` varchar(255) NOT NULL,
	`created_at` datetime(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
	`updated_at` datetime(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
	CONSTRAINT `collections_id` PRIMARY KEY(`id`),
	CONSTRAINT `collections_store_id_shopify_id_unique` UNIQUE(`store_id`,`shopify_id`),
	CONSTRAINT `collections_store_id_id_unique` UNIQUE(`store_id`,`id`)
);
--> statement-breakpoint
CREATE TABLE `order_items` (
	`id` bigint unsigned AUTO_INCREMENT NOT NULL,
	`store_id` bigint unsigned NOT NULL,
	`order_id` bigint unsigned NOT NULL,
	`product_id` bigint unsigned,
	`variant_id` bigint unsigned,
	`shopify_id` bigint unsigned NOT NULL,
	`title` varchar(255) NOT NULL,
	`variant_title` varchar(255),
	`sku` varchar(255),
	`quantity` int unsigned NOT NULL,
	`price` decimal(19,4) NOT NULL,
	`created_at` datetime(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
	`updated_at` datetime(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
	CONSTRAINT `order_items_id` PRIMARY KEY(`id`),
	CONSTRAINT `order_items_store_id_shopify_id_unique` UNIQUE(`store_id`,`shopify_id`)
);
--> statement-breakpoint
CREATE TABLE `orders` (
	`id` bigint unsigned AUTO_INCREMENT NOT NULL,
	`store_id` bigint unsigned NOT NULL,
	`shopify_id` bigint unsigned NOT NULL,
	`name` varchar(255) NOT NULL,
	`currency` char(3) NOT NULL,
	`total_price` decimal(19,4) NOT NULL,
	`financial_status` varchar(32) NOT NULL,
	`fulfillment_status` varchar(32),
	`placed_at` datetime(3) NOT NULL,
	`cancelled_at` datetime(3),
	`created_at` datetime(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
	`updated_at` datetime(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
	CONSTRAINT `orders_id` PRIMARY KEY(`id`),
	CONSTRAINT `orders_store_id_shopify_id_unique` UNIQUE(`store_id`,`shopify_id`),
	CONSTRAINT `orders_store_id_id_unique` UNIQUE(`store_id`,`id`)
);
--> statement-breakpoint
CREATE TABLE `product_variants` (
	`id` bigint unsigned AUTO_INCREMENT NOT NULL,
	`store_id` bigint unsigned NOT NULL,
	`shopify_id` bigint unsigned NOT NULL,
	`product_id` bigint unsigned NOT NULL,
	`title` varchar(255) NOT NULL,
	`sku` varchar(255),
	`price` decimal(19,4) NOT NULL,
	`position` int unsigned NOT NULL,
	`created_at` datetime(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
	`updated_at` datetime(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
	CONSTRAINT `product_variants_id` PRIMARY KEY(`id`),
	CONSTRAINT `product_variants_store_id_shopify_id_unique` UNIQUE(`store_id`,`shopify_id`),
	CONSTRAINT `product_variants_store_id_id_unique` UNIQUE(`store_id`,`id`)
);
--> statement-breakpoint
CREATE TABLE `products` (
	`id` bigint unsigned AUTO_INCREMENT NOT NULL,
	`store_id` bigint unsigned NOT NULL,
	`shopify_id` bigint unsigned NOT NULL,
	`title` varchar(255) NOT NULL,
	`handle` varchar(255) NOT NULL,
	`vendor` varchar(255),
	`product_type` varchar(255),
	`status` varchar(32) NOT NULL,
	`deleted_at` datetime(3),
	`created_at` datetime(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
	`updated_at` datetime(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
	CONSTRAINT `products_id` PRIMARY KEY(`id`),
	CONSTRAINT `products_store_id_shopify_id_unique` UNIQUE(`store_id`,`shopify_id`),
	CONSTRAINT `products_store_id_id_unique` UNIQUE(`store_id`,`id`)
);
--> statement-breakpoint
CREATE TABLE `store_analytics` (
	`store_id` bigint unsigned NOT NULL,
	`day` date NOT NULL,
	`orders_count` int unsigned NOT NULL DEFAULT 0,
	`revenue` decimal(19,4) NOT NULL DEFAULT '0',
	`created_at` datetime(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
	`updated_at` datetime(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
	CONSTRAINT `store_analytics_store_id_day_pk` PRIMARY KEY(`store_id`,`day`)
);
--> statement-breakpoint
CREATE TABLE `store_credentials` (
	`store_id` bigint unsigned NOT NULL,
	`access_token` varchar(255) NOT NULL,
	`scopes` text NOT NULL,
	`expires_at` datetime(3),
	`created_at` datetime(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
	`updated_at` datetime(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
	CONSTRAINT `store_credentials_store_id` PRIMARY KEY(`store_id`)
);
--> statement-breakpoint
CREATE TABLE `stores` (
	`id` bigint unsigned AUTO_INCREMENT NOT NULL,
	`shopify_id` bigint unsigned NOT NULL,
	`shop_domain` varchar(255) NOT NULL,
	`name` varchar(255) NOT NULL,
	`currency` char(3) NOT NULL,
	`installed_at` datetime(3) NOT NULL,
	`uninstalled_at` datetime(3),
	`created_at` datetime(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
	`updated_at` datetime(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
	CONSTRAINT `stores_id` PRIMARY KEY(`id`),
	CONSTRAINT `stores_shopify_id_unique` UNIQUE(`shopify_id`),
	CONSTRAINT `stores_shop_domain_unique` UNIQUE(`shop_domain`)
);
--> statement-breakpoint
CREATE TABLE `webhook_records` (
	`id` bigint unsigned AUTO_INCREMENT NOT NULL,
	`store_id` bigint unsigned NOT NULL,
	`delivery_id` varchar(64) NOT NULL,
	`topic` varchar(64) NOT NULL,
	`subject_shopify_id` bigint unsigned,
	`status` enum('received','processed','failed') NOT NULL,
	`received_at` datetime(3) NOT NULL,
	`processed_at` datetime(3),
	`attempts` int unsigned NOT NULL DEFAULT 0,
	`last_error` text,
	`created_at` datetime(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
	`updated_at` datetime(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
	CONSTRAINT `webhook_records_id` PRIMARY KEY(`id`),
	CONSTRAINT `webhook_records_store_id_delivery_id_unique` UNIQUE(`store_id`,`delivery_id`)
);
--> statement-breakpoint
ALTER TABLE `collection_products` ADD CONSTRAINT `collection_products_store_id_collection_id_fk` FOREIGN KEY (`store_id`,`collection_id`) REFERENCES `collections`(`store_id`,`id`) ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE `collection_products` ADD CONSTRAINT `collection_products_store_id_product_id_fk` FOREIGN KEY (`store_id`,`product_id`) REFERENCES `products`(`store_id`,`id`) ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE `collections` ADD CONSTRAINT `collections_store_id_fk` FOREIGN KEY (`store_id`) REFERENCES `stores`(`id`) ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE `order_items` ADD CONSTRAINT `order_items_store_id_order_id_fk` FOREIGN KEY (`store_id`,`order_id`) REFERENCES `orders`(`store_id`,`id`) ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE `order_items` ADD CONSTRAINT `order_items_product_id_fk` FOREIGN KEY (`product_id`) REFERENCES `products`(`id`) ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE `order_items` ADD CONSTRAINT `order_items_variant_id_fk` FOREIGN KEY (`variant_id`) REFERENCES `product_variants`(`id`) ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE `orders` ADD CONSTRAINT `orders_store_id_fk` FOREIGN KEY (`store_id`) REFERENCES `stores`(`id`) ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE `product_variants` ADD CONSTRAINT `product_variants_store_id_product_id_fk` FOREIGN KEY (`store_id`,`product_id`) REFERENCES `products`(`store_id`,`id`) ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE `products` ADD CONSTRAINT `products_store_id_fk` FOREIGN KEY (`store_id`) REFERENCES `stores`(`id`) ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE `store_analytics` ADD CONSTRAINT `store_analytics_store_id_fk` FOREIGN KEY (`store_id`) REFERENCES `stores`(`id`) ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE `store_credentials` ADD CONSTRAINT `store_credentials_store_id_fk` FOREIGN KEY (`store_id`) REFERENCES `stores`(`id`) ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE `webhook_records` ADD CONSTRAINT `webhook_records_store_id_fk` FOREIGN KEY (`store_id`) REFERENCES `stores`(`id`) ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE INDEX `collection_products_store_id_collection_id_idx` ON `collection_products` (`store_id`,`collection_id`);--> statement-breakpoint
CREATE INDEX `collection_products_store_id_product_id_idx` ON `collection_products` (`store_id`,`product_id`);--> statement-breakpoint
CREATE INDEX `order_items_store_id_order_id_idx` ON `order_items` (`store_id`,`order_id`);--> statement-breakpoint
CREATE INDEX `order_items_product_id_idx` ON `order_items` (`product_id`);--> statement-breakpoint
CREATE INDEX `order_items_variant_id_idx` ON `order_items` (`variant_id`);--> statement-breakpoint
CREATE INDEX `product_variants_store_id_product_id_idx` ON `product_variants` (`store_id`,`product_id`);