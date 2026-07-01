-- ─────────────────────────────────────────────────────────────────
-- Migration 001: Performance indexes
-- Run this in Supabase → SQL Editor
-- ─────────────────────────────────────────────────────────────────

-- poi_items
CREATE INDEX IF NOT EXISTS idx_poi_items_user_id        ON poi_items (user_id);
CREATE INDEX IF NOT EXISTS idx_poi_items_created_at     ON poi_items (created_at DESC);
CREATE INDEX IF NOT EXISTS idx_poi_items_is_published   ON poi_items (is_published) WHERE is_published = true;
CREATE INDEX IF NOT EXISTS idx_poi_items_country        ON poi_items (country);
CREATE INDEX IF NOT EXISTS idx_poi_items_type           ON poi_items (type);

-- poi_photos
CREATE INDEX IF NOT EXISTS idx_poi_photos_poi_id        ON poi_photos (poi_id);
CREATE INDEX IF NOT EXISTS idx_poi_photos_created_at    ON poi_photos (created_at ASC);

-- trips
CREATE INDEX IF NOT EXISTS idx_trips_user_id            ON trips (user_id);
CREATE INDEX IF NOT EXISTS idx_trips_created_at         ON trips (created_at DESC);
CREATE INDEX IF NOT EXISTS idx_trips_is_public          ON trips (is_public) WHERE is_public = true;
CREATE INDEX IF NOT EXISTS idx_trips_trip_type          ON trips (trip_type);

-- trip_items
CREATE INDEX IF NOT EXISTS idx_trip_items_trip_id       ON trip_items (trip_id);

-- trip_planning_items
CREATE INDEX IF NOT EXISTS idx_trip_planning_trip_id    ON trip_planning_items (trip_id);

-- trip_notes
CREATE INDEX IF NOT EXISTS idx_trip_notes_trip_id       ON trip_notes (trip_id);

-- trip_checkpoints
CREATE INDEX IF NOT EXISTS idx_trip_checkpoints_trip_id ON trip_checkpoints (trip_id);

-- trip_ratings
CREATE INDEX IF NOT EXISTS idx_trip_ratings_trip_id     ON trip_ratings (trip_id);
CREATE INDEX IF NOT EXISTS idx_trip_ratings_user_id     ON trip_ratings (user_id);

-- conversations
CREATE INDEX IF NOT EXISTS idx_conversations_updated    ON conversations (updated_at DESC);

-- conversation_participants
CREATE INDEX IF NOT EXISTS idx_conv_participants_user   ON conversation_participants (user_id);
CREATE INDEX IF NOT EXISTS idx_conv_participants_conv   ON conversation_participants (conversation_id);

-- messages
CREATE INDEX IF NOT EXISTS idx_messages_conversation    ON messages (conversation_id);
CREATE INDEX IF NOT EXISTS idx_messages_created_at      ON messages (created_at ASC);
CREATE INDEX IF NOT EXISTS idx_messages_unread          ON messages (read_at) WHERE read_at IS NULL;
CREATE INDEX IF NOT EXISTS idx_messages_sender          ON messages (sender_id);

-- photo_pins
CREATE INDEX IF NOT EXISTS idx_photo_pins_user_id       ON photo_pins (user_id);

-- Ensure conversations id defaults to gen_random_uuid()
ALTER TABLE conversations
  ALTER COLUMN id SET DEFAULT gen_random_uuid();
