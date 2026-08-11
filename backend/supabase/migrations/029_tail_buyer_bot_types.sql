-- Add tail-buyer bot types for Polymarket and Kalshi
INSERT INTO bot_types (id, name, full_name, description, strategy, llms, exchange, accent_color, bg_tint, deprecated) VALUES
    ('polymarket-tail-buyer', 'Tail Buyer (Poly)', 'Tail Buyer — Polymarket',
     'Buys near-zero probability contracts (0.1-2 cents) at scale. Rule-based, no AI.',
     'Rule-based tail buying: scan for contracts priced 0.1-2 cents, buy cheap side at fixed size',
     'None', 'polymarket', '#f59e0b', '#f59e0b08', FALSE),
    ('kalshi-tail-buyer', 'Tail Buyer (Kalshi)', 'Tail Buyer — Kalshi',
     'Buys near-zero probability contracts (0.1-2 cents) at scale. Rule-based, no AI.',
     'Rule-based tail buying: scan for contracts priced 0.1-2 cents, buy cheap side at fixed size',
     'None', 'kalshi', '#f59e0b', '#f59e0b08', FALSE)
ON CONFLICT (id) DO NOTHING;
