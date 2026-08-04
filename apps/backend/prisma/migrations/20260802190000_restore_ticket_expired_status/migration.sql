-- Online acquiring makes booking expiry reachable again. The earlier legacy
-- cleanup removed this value while payments were still disabled.
ALTER TYPE "TicketStatus" ADD VALUE IF NOT EXISTS 'EXPIRED';
