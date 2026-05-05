-- =============================================================================
-- Change order number format to short professional style
-- Format: HC-NNNNN (5 digits, e.g. HC-01021)
-- HC = Hichoux (your brand prefix — change here if needed)
-- =============================================================================

CREATE OR REPLACE FUNCTION generate_order_number()
RETURNS TRIGGER AS $$
BEGIN
  IF NEW.order_number IS NULL OR NEW.order_number = '' THEN
    NEW.order_number := 'HC-' || LPAD(nextval('order_number_seq')::TEXT, 5, '0');
  END IF;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- Trigger already exists, function replacement is enough
