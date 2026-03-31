-- Migration: Add property_referrals table
-- Property referral program: users refer properties to Portugal Active portfolio
-- Select tier = EUR 500 reward · Luxury tier = EUR 1000 reward

CREATE TABLE IF NOT EXISTS `property_referrals` (
  `id` int AUTO_INCREMENT NOT NULL,
  `referrerId` int NOT NULL,
  `ownerName` varchar(255) NOT NULL,
  `ownerEmail` varchar(320),
  `ownerPhone` varchar(50),
  `propertyAddress` varchar(500),
  `propertyCity` varchar(100),
  `propertyRegion` varchar(100),
  `propertyBedrooms` int,
  `propertyType` varchar(100),
  `propertyDescription` text,
  `notes` text,
  `tier` enum('select','luxury'),
  `status` enum('submitted','contacted','under_review','signed','rejected') NOT NULL DEFAULT 'submitted',
  `rewardAmount` int NOT NULL DEFAULT 0,
  `rewardPaid` boolean NOT NULL DEFAULT false,
  `adminNotes` text,
  `createdAt` timestamp NOT NULL DEFAULT (now()),
  `updatedAt` timestamp NOT NULL DEFAULT (now()) ON UPDATE CURRENT_TIMESTAMP,
  CONSTRAINT `property_referrals_id` PRIMARY KEY(`id`)
);

-- Index for fast referrer lookups
CREATE INDEX `idx_property_referrals_referrer` ON `property_referrals` (`referrerId`);
CREATE INDEX `idx_property_referrals_status` ON `property_referrals` (`status`);
