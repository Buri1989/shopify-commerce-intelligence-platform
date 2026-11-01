UPDATE orders SET placed_on = DATE(placed_at) WHERE placed_on IS NULL;
