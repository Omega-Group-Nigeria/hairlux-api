/**
 * Bull queue name for home-service matching.
 * Kept in its own file so services on both sides of the dispatch flow can
 * import it without creating a circular module dependency.
 */
export const HOME_SERVICE_MATCHING_QUEUE = 'home-service-matching';
