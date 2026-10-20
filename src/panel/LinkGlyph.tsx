/**
 * Hand-drawn link glyphs (v1.12) — inline SVG in the same ink language as the
 * authored map art (no brand gradients, no icon dependency). Every glyph is
 * decorative (`aria-hidden`, `focusable="false"`); the anchor text carries
 * the accessible name.
 */

interface GlyphProps {
  className?: string
}

/** Instagram: wobbly rounded square + lens + shutter dot. */
export function InstagramGlyph({ className }: GlyphProps) {
  return (
    <svg
      className={className}
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.8"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
      focusable="false"
    >
      <path d="M7.4 2.9c4.9-.5 9.9-.4 10.6 2.8.6 2.9.5 9.9-.2 13.1-.7 3-6.6 3.2-11.1 2.6-3-.4-3.7-2.2-3.8-5.9-.1-4.2.2-9.4 4.5-12.6Z" />
      <path d="M8.6 7.1c3.6-.2 5.8-.1 6.7.6.7.6.8 2.4.7 4.6-.1 2.9-.4 4.3-1.6 4.7-1.8.6-4.9.5-6.4-.2-1.1-.5-1.3-1.7-1.2-4.4.1-2.4.4-5.1 1.8-5.3Z" />
      <path d="M11.6 9.2c1.6-.3 2.7.7 2.6 2.2-.1 1.6-1.2 2.4-2.5 2.2-1.4-.2-2.1-1.2-1.9-2.6.1-1 .8-1.7 1.8-1.8Z" />
      <circle cx="16.1" cy="8.2" r="0.7" fill="currentColor" stroke="none" />
    </svg>
  )
}

/** Article: a sheet of paper with uneven ink lines. */
export function ArticleGlyph({ className }: GlyphProps) {
  return (
    <svg
      className={className}
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.8"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
      focusable="false"
    >
      <path d="M4.6 3.2c4.9-.4 9.9-.2 14.6-.1.7 5.7.5 11.6 0 17.7-4.7.4-9.8.4-14.5.1-.6-5.1-.7-12.4-.1-17.7Z" />
      <path d="M7.6 7.2c2.9-.2 6.1-.2 8.8 0M7.7 10.6c3.1-.1 6.2-.1 8.7.1M7.7 14c2.4-.1 4.9-.1 8.6 0M7.7 17.4c1.6-.1 3.3-.1 5.4 0" />
    </svg>
  )
}

/** Globe: other social/website destinations. */
export function GlobeGlyph({ className }: GlyphProps) {
  return (
    <svg
      className={className}
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.8"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
      focusable="false"
    >
      <path d="M12 2.8c5.1-.2 9.2 3.8 9.1 9-.1 5.3-4.1 9.3-9.2 9.3-5 0-9-4-9-9.1 0-5.1 3.9-9.1 9.1-9.2Z" />
      <path d="M3.2 12c5.9.3 11.8.2 17.7 0M12 2.9c-2.9 2.5-4.4 5.6-4.4 9.1 0 3.6 1.5 6.7 4.4 9.1M12 2.9c2.9 2.6 4.4 5.6 4.4 9.1 0 3.6-1.5 6.6-4.4 9.1" />
    </svg>
  )
}

/** External-link arrow (opens in a new tab). */
export function ExternalGlyph({ className }: GlyphProps) {
  return (
    <svg
      className={className}
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="2"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
      focusable="false"
    >
      <path d="M8.4 6.1c3.1-.2 6.3-.2 9.5 0 .3 3.2.3 6.4 0 9.6M17.5 6.4c-4.4 4.3-8.8 8.6-13.1 13" />
    </svg>
  )
}
