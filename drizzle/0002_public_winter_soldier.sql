CREATE TABLE `destinations` (
	`id` int AUTO_INCREMENT NOT NULL,
	`name` varchar(255) NOT NULL,
	`slug` varchar(255) NOT NULL,
	`tagline` varchar(500),
	`description` text,
	`whyDescription` text,
	`whyOverline` varchar(255),
	`coverImage` varchar(500),
	`gallery` json DEFAULT ('[]'),
	`highlights` json DEFAULT ('[]'),
	`howToGetHere` text,
	`bestTimeToVisit` text,
	`whatToExpect` text,
	`insiderRecommendations` json DEFAULT ('[]'),
	`propertyCount` int DEFAULT 0,
	`comingSoon` boolean NOT NULL DEFAULT false,
	`seoTitle` varchar(255),
	`seoDescription` varchar(500),
	`status` varchar(50) DEFAULT 'active',
	`sortOrder` int NOT NULL DEFAULT 0,
	`isActive` boolean NOT NULL DEFAULT true,
	`createdAt` timestamp NOT NULL DEFAULT (now()),
	`updatedAt` timestamp NOT NULL DEFAULT (now()) ON UPDATE CURRENT_TIMESTAMP,
	CONSTRAINT `destinations_id` PRIMARY KEY(`id`),
	CONSTRAINT `destinations_slug_unique` UNIQUE(`slug`)
);
--> statement-breakpoint
ALTER TABLE `properties` MODIFY COLUMN `amenities` json DEFAULT ('{}');--> statement-breakpoint
ALTER TABLE `experiences` ADD `tagline` varchar(500);--> statement-breakpoint
ALTER TABLE `experiences` ADD `priceSuffix` varchar(100);--> statement-breakpoint
ALTER TABLE `experiences` ADD `image` varchar(500);--> statement-breakpoint
ALTER TABLE `experiences` ADD `gallery` json DEFAULT ('[]');--> statement-breakpoint
ALTER TABLE `experiences` ADD `whatsappMessage` varchar(500);--> statement-breakpoint
ALTER TABLE `experiences` ADD `destinations` json DEFAULT ('[]');--> statement-breakpoint
ALTER TABLE `properties` ADD `locality` varchar(255);--> statement-breakpoint
ALTER TABLE `properties` ADD `bathrooms` int DEFAULT 0 NOT NULL;--> statement-breakpoint
ALTER TABLE `properties` ADD `currency` varchar(10) DEFAULT 'EUR';--> statement-breakpoint
ALTER TABLE `properties` ADD `style` varchar(100);--> statement-breakpoint
ALTER TABLE `properties` ADD `tags` json DEFAULT ('[]');--> statement-breakpoint
ALTER TABLE `properties` ADD `occasions` json DEFAULT ('[]');--> statement-breakpoint
ALTER TABLE `properties` ADD `stayIncludes` json DEFAULT ('[]');--> statement-breakpoint
ALTER TABLE `properties` ADD `bookingUrl` varchar(500);--> statement-breakpoint
ALTER TABLE `properties` ADD `whatsappMessage` varchar(500);--> statement-breakpoint
ALTER TABLE `properties` ADD `seoTitle` varchar(255);--> statement-breakpoint
ALTER TABLE `properties` ADD `seoDescription` varchar(500);--> statement-breakpoint
ALTER TABLE `reviews` ADD `guestCountry` varchar(255);--> statement-breakpoint
ALTER TABLE `reviews` ADD `source` varchar(100);--> statement-breakpoint
ALTER TABLE `reviews` ADD `date` varchar(20);--> statement-breakpoint
ALTER TABLE `services` ADD `tagline` varchar(500);--> statement-breakpoint
ALTER TABLE `services` ADD `image` varchar(500);--> statement-breakpoint
ALTER TABLE `services` ADD `details` json DEFAULT ('[]');--> statement-breakpoint
ALTER TABLE `services` ADD `price` varchar(100);--> statement-breakpoint
ALTER TABLE `services` ADD `duration` varchar(100);--> statement-breakpoint
ALTER TABLE `services` ADD `availability` varchar(255);--> statement-breakpoint
ALTER TABLE `services` ADD `whatsappMessage` varchar(500);