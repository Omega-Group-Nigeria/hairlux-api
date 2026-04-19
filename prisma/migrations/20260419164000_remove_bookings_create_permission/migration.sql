-- Remove deprecated manual booking creation permission from existing role assignments
DELETE FROM "admin_role_permissions"
WHERE "permission" = 'bookings:create';
