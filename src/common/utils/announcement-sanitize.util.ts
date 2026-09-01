import sanitizeHtml from 'sanitize-html';

/**
 * Allowlist matches EXACTLY what the admin Quill editor's toolbar can
 * produce (bold/italic/underline, ordered/unordered lists, link) — nothing
 * broader. Server-side sanitization is the real defense here, not the
 * frontend's; the frontend Quill config limits what an admin CAN create
 * through the UI, but this is what actually protects every staff member
 * who reads the rendered result, since the API can be called directly
 * regardless of what the admin UI allows.
 */
export function sanitizeAnnouncementHtml(html: string): string {
    return sanitizeHtml(html, {
        allowedTags: ['p', 'br', 'strong', 'b', 'em', 'i', 'u', 'ol', 'ul', 'li', 'a'],
        allowedAttributes: { a: ['href', 'target', 'rel'] },
        allowedSchemes: ['http', 'https', 'mailto'],
        transformTags: {
            // Quill emits target/rel inconsistently on links — normalize so
            // every link opens safely in a new tab regardless of what the
            // editor produced.
            a: sanitizeHtml.simpleTransform('a', { target: '_blank', rel: 'noopener noreferrer' }),
        },
    }).trim();
}