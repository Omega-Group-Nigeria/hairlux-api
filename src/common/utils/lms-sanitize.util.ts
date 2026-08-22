import sanitizeHtml from 'sanitize-html';

/**
 * Parallel to sanitizeAnnouncementHtml, not a reuse of it -- the LMS admin
 * Quill toolbar additionally allows headers (H1-H3), which that other
 * allowlist deliberately excludes since its own editor doesn't offer them.
 * Same principle: this is what actually protects every staff member who
 * views a course, since the create/update API can be called directly
 * regardless of what the admin UI's toolbar allows.
 */
export function sanitizeLmsHtml(html: string): string {
    return sanitizeHtml(html, {
        allowedTags: ['p', 'br', 'strong', 'b', 'em', 'i', 'u', 'h1', 'h2', 'h3', 'ol', 'ul', 'li', 'a'],
        allowedAttributes: { a: ['href', 'target', 'rel'] },
        allowedSchemes: ['http', 'https', 'mailto'],
        transformTags: {
            a: sanitizeHtml.simpleTransform('a', { target: '_blank', rel: 'noopener noreferrer' }),
        },
    }).trim();
}