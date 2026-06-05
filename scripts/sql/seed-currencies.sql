INSERT INTO currencies (id, code, name, symbol, isBase, createdAt, updatedAt)
VALUES
  (UUID(), 'COP', 'Peso colombiano', '$',   1, NOW(3), NOW(3)),
  (UUID(), 'USD', 'Dólar americano', 'US$', 0, NOW(3), NOW(3)),
  (UUID(), 'EUR', 'Euro',            '€',   0, NOW(3), NOW(3))
ON DUPLICATE KEY UPDATE
  name      = VALUES(name),
  symbol    = VALUES(symbol),
  updatedAt = NOW(3);
-- isBase NO se sobreescribe en UPDATE (no pisar configuración manual)
