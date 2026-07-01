CREATE TABLE IF NOT EXISTS `inventory_slots` (
  `identifier`  VARCHAR(60) NOT NULL,
  `item_name`   VARCHAR(50) NOT NULL,
  `stack_index` INT(11) NOT NULL DEFAULT 0,
  `slot`        INT(11) NOT NULL,
  PRIMARY KEY (`identifier`, `item_name`, `stack_index`)
);
