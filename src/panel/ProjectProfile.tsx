/**
 * v1.12 project profile block (Sol plan): mini-bio + social links + "life
 * stories" links, shown at the TOP of the panel body — before the six
 * thematic sections, so it is visible without scrolling. Each part renders
 * only when its data exists; the whole block returns null when the project
 * has none. Icons are authored inline glyphs (LinkGlyph) in the hand-drawn
 * ink language — no runtime deps, no new asset files.
 */
import type { Project } from '../data/types'
import { ui } from '../data/ui'
import { ArticleGlyph, ExternalGlyph, GlobeGlyph, InstagramGlyph } from './LinkGlyph'

interface ProjectProfileProps {
  project: Project
  /** Heading id prefix — unique per dialog instance. */
  idPrefix?: string
}

function hostnameOf(url: string): string {
  try {
    return new URL(url).hostname.replace(/^www\./i, '')
  } catch {
    return ''
  }
}

function isInstagram(host: string): boolean {
  return host === 'instagram.com' || host === 'www.instagram.com'
}

/** `@handle` for a profile URL; null for post/reel permalinks (those are
 * stories, not profiles). */
function instagramHandle(url: string): string | null {
  const match = url.match(/instagram\.com\/([^/?#]+)/i)
  if (!match) return null
  const segment = match[1]
  if (['p', 'reel', 'reels', 'tv', 'stories', 'explore'].includes(segment.toLowerCase())) {
    return null
  }
  return `@${segment}`
}

type LinkKind = 'instagram' | 'article' | 'website'

interface ProfileLink {
  url: string
  kind: LinkKind
  /** Visible label, e.g. "Instagram · @redecasacura". */
  label: string
}

function socialLink(url: string): ProfileLink {
  const host = hostnameOf(url)
  if (isInstagram(host)) {
    const handle = instagramHandle(url)
    return {
      url,
      kind: 'instagram',
      label: handle ? `${ui.labels.instagram} · ${handle}` : `${ui.labels.instagram} · ${host}`,
    }
  }
  return { url, kind: 'website', label: `${ui.labels.website} · ${host}` }
}

function storyLink(url: string, index: number, total: number): ProfileLink {
  const host = hostnameOf(url)
  const suffix = total > 1 ? ` · ${index + 1}` : ''
  if (isInstagram(host)) {
    return { url, kind: 'instagram', label: `${ui.labels.instagramPost}${suffix}` }
  }
  if (host === 'nacuia.org' || host === 'www.nacuia.org') {
    return { url, kind: 'article', label: `${ui.labels.article} · ${host}${suffix}` }
  }
  return { url, kind: 'article', label: `${ui.labels.article} · ${host}${suffix}` }
}

function Glyph({ kind }: { kind: LinkKind }) {
  if (kind === 'instagram') return <InstagramGlyph className="panel-link-glyph" />
  if (kind === 'article') return <ArticleGlyph className="panel-link-glyph" />
  return <GlobeGlyph className="panel-link-glyph" />
}

function LinkRow({ link, projectName }: { link: ProfileLink; projectName: string }) {
  return (
    <li>
      <a
        className="panel-link"
        href={link.url}
        target="_blank"
        rel="noopener noreferrer"
        aria-label={`${link.label} — ${projectName} (${ui.labels.newTab})`}
      >
        <Glyph kind={link.kind} />
        <span className="panel-link-label">{link.label}</span>
        <ExternalGlyph className="panel-link-external" />
      </a>
    </li>
  )
}

export function ProjectProfile({ project, idPrefix = 'panel' }: ProjectProfileProps) {
  const bio = project.miniBio?.trim() ?? ''
  const socials = (project.socialLinks ?? []).map(socialLink)
  const stories = (project.lifeStories ?? []).map((url, i, all) => storyLink(url, i, all.length))
  if (!bio && socials.length === 0 && stories.length === 0) return null

  return (
    <div className="panel-profile">
      {bio !== '' && (
        <p className="panel-bio" style={{ whiteSpace: 'pre-line' }}>
          {bio}
        </p>
      )}
      {socials.length > 0 && (
        <section className="panel-link-group" aria-labelledby={`${idPrefix}-social-heading`}>
          <h3 id={`${idPrefix}-social-heading`} className="panel-link-heading">
            {ui.labels.socialLinks}
          </h3>
          <ul className="panel-link-list">
            {socials.map((link) => (
              <LinkRow key={link.url} link={link} projectName={project.name} />
            ))}
          </ul>
        </section>
      )}
      {stories.length > 0 && (
        <section className="panel-link-group" aria-labelledby={`${idPrefix}-stories-heading`}>
          <h3 id={`${idPrefix}-stories-heading`} className="panel-link-heading">
            {ui.labels.lifeStories}
          </h3>
          <ul className="panel-link-list">
            {stories.map((link) => (
              <LinkRow key={link.url} link={link} projectName={project.name} />
            ))}
          </ul>
        </section>
      )}
    </div>
  )
}
