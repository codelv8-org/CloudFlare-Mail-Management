CREATE TABLE `annotations` (
	`owner` text NOT NULL,
	`zone` text NOT NULL,
	`rule` text NOT NULL,
	`data` text NOT NULL,
	PRIMARY KEY(`owner`, `zone`, `rule`)
);
--> statement-breakpoint
CREATE TABLE `audit` (
	`id` text PRIMARY KEY NOT NULL,
	`owner` text NOT NULL,
	`action` text NOT NULL,
	`target` text NOT NULL,
	`before` text,
	`outcome` text NOT NULL,
	`created` text NOT NULL
);
--> statement-breakpoint
CREATE INDEX `idx_audit_owner_created` ON `audit` (`owner`,`created`);--> statement-breakpoint
CREATE TABLE `catalogs` (
	`owner` text PRIMARY KEY NOT NULL,
	`data` text NOT NULL,
	`revision` integer DEFAULT 0 NOT NULL
);
--> statement-breakpoint
CREATE TABLE `connections` (
	`owner` text PRIMARY KEY NOT NULL,
	`account` text NOT NULL,
	`ciphertext` text NOT NULL,
	`updated` text NOT NULL
);
--> statement-breakpoint
CREATE TABLE `limits` (
	`owner` text PRIMARY KEY NOT NULL,
	`window` integer NOT NULL,
	`count` integer NOT NULL
);
