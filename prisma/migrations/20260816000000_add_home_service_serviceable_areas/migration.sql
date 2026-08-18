-- Admin-configured serviceable areas for HOME_SERVICE bookings.
-- JSON array of { state, city } objects, where city may be "*" to allow every
-- city in that state. An empty array (the default) disables home service everywhere.

ALTER TABLE "home_service_settings" ADD COLUMN "serviceable_areas" JSONB NOT NULL DEFAULT '[]';