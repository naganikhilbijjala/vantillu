CREATE TABLE `cook_event` (
	`id` text PRIMARY KEY NOT NULL,
	`dish_id` text NOT NULL,
	`cooked_at` text NOT NULL,
	`slot` text NOT NULL,
	`meal_id` text,
	`rating` integer,
	`tweak_note` text,
	`photo_uri` text,
	`is_batch` integer DEFAULT false NOT NULL,
	`is_estimated` integer DEFAULT false NOT NULL,
	`created_at` text NOT NULL,
	`updated_at` text NOT NULL,
	`deleted_at` text,
	FOREIGN KEY (`dish_id`) REFERENCES `dish`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE INDEX `cook_event_dish_id_idx` ON `cook_event` (`dish_id`);--> statement-breakpoint
CREATE INDEX `cook_event_cooked_at_idx` ON `cook_event` (`cooked_at`);--> statement-breakpoint
CREATE INDEX `cook_event_meal_id_idx` ON `cook_event` (`meal_id`);--> statement-breakpoint
CREATE TABLE `dish` (
	`id` text PRIMARY KEY NOT NULL,
	`name` text NOT NULL,
	`alt_name` text,
	`role` text NOT NULL,
	`primary_ingredient` text,
	`effort` text NOT NULL,
	`minutes` integer,
	`is_veg` integer DEFAULT true NOT NULL,
	`prep_kind` text,
	`prep_lead_hours` integer,
	`prep_label` text,
	`uses_leftover_rice` integer DEFAULT false NOT NULL,
	`is_festive` integer DEFAULT false NOT NULL,
	`season` text,
	`ingredients_text` text,
	`method_text` text,
	`notes` text,
	`source` text,
	`is_archived` integer DEFAULT false NOT NULL,
	`created_at` text NOT NULL,
	`updated_at` text NOT NULL,
	`deleted_at` text
);
--> statement-breakpoint
CREATE INDEX `dish_role_idx` ON `dish` (`role`);--> statement-breakpoint
CREATE INDEX `dish_deleted_at_idx` ON `dish` (`deleted_at`);--> statement-breakpoint
CREATE TABLE `dish_slot` (
	`dish_id` text NOT NULL,
	`slot` text NOT NULL,
	`created_at` text NOT NULL,
	`updated_at` text NOT NULL,
	`deleted_at` text,
	PRIMARY KEY(`dish_id`, `slot`),
	FOREIGN KEY (`dish_id`) REFERENCES `dish`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE INDEX `dish_slot_slot_idx` ON `dish_slot` (`slot`);--> statement-breakpoint
CREATE TABLE `prep_state` (
	`id` text PRIMARY KEY NOT NULL,
	`kind` text NOT NULL,
	`ingredient` text,
	`label` text,
	`ready_at` text,
	`expires_at` text,
	`created_at` text NOT NULL,
	`updated_at` text NOT NULL,
	`deleted_at` text
);
--> statement-breakpoint
CREATE INDEX `prep_state_kind_ingredient_idx` ON `prep_state` (`kind`,`ingredient`);--> statement-breakpoint
CREATE TABLE `role_config` (
	`role` text PRIMARY KEY NOT NULL,
	`label` text NOT NULL,
	`is_always_available` integer DEFAULT false NOT NULL,
	`sort_order` integer NOT NULL,
	`created_at` text NOT NULL,
	`updated_at` text NOT NULL,
	`deleted_at` text
);
--> statement-breakpoint
CREATE TABLE `setting` (
	`key` text PRIMARY KEY NOT NULL,
	`value` text NOT NULL,
	`created_at` text NOT NULL,
	`updated_at` text NOT NULL,
	`deleted_at` text
);
