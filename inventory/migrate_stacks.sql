-- Falls du install.sql schon einmal ausgeführt hast, nutze stattdessen
-- dieses Migrations-Skript, um die bestehende Tabelle anzupassen:

ALTER TABLE `inventory_slots` DROP PRIMARY KEY;
ALTER TABLE `inventory_slots` ADD COLUMN `stack_index` INT(11) NOT NULL DEFAULT 0;
ALTER TABLE `inventory_slots` ADD PRIMARY KEY (`identifier`, `item_name`, `stack_index`);
