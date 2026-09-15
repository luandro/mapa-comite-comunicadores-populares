import { optimize } from 'svgo'
import type { Plugin, Visitor, XastElement, XastParent, XastRoot } from 'svgo/lib/types'

/**
 * Scene asset BUILD pipeline (SPEC §3, ordered): resolve the Illustrator
 * `<style>` class rules into per-node presentation attributes — ALL declared
 * properties (`fill`, `opacity`, …), not just fill — drop the stylesheet and
 * class wiring, then prefix ids so several assets can coexist in one inline
 * scene SVG. Pure string in / string out: no DOM globals, safe outside
 * browsers. BUILD-TIME ONLY — imported solely by `vite.config.ts`; nothing
 * runtime may import this module or svogo lands in the client bundle. The
 * runtime half (partitionBase + friends) lives in `partition.ts`.
 */

/** class name → property → resolved value (insertion order = declaration order) */
type ClassRules = Map<string, Map<string, string>>

const CLASS_SELECTOR = /^\.[-\w]+$/
const NO_PROPS: ReadonlySet<string> = new Set()

/**
 * Parse simple `.cls-N { prop: value; … }` rules: split on `}`, `;`, first
 * `:`. Fails loud (SPEC §2) on any rule that declares properties under no
 * parseable class selector — Illustrator emits only `.cls-N`, so anything
 * else means the stylesheet ground truth changed and must not pass silently.
 */
function parseClassRules(css: string): ClassRules {
  const rules: ClassRules = new Map()
  for (const rule of css.replace(/\/\*[\s\S]*?\*\//g, '').split('}')) {
    const brace = rule.indexOf('{')
    if (brace === -1) continue
    const declarations = new Map<string, string>()
    for (const declaration of rule.slice(brace + 1).split(';')) {
      const colon = declaration.indexOf(':')
      if (colon === -1) continue
      const prop = declaration.slice(0, colon).trim()
      const value = declaration.slice(colon + 1).trim()
      if (prop && value) declarations.set(prop, value)
    }
    const selectorText = rule.slice(0, brace).trim()
    const classNames = selectorText
      .split(',')
      .map((selector) => selector.trim())
      .filter((selector) => CLASS_SELECTOR.test(selector))
    if (classNames.length === 0 && declarations.size > 0) {
      throw new Error(`unsupported selector "${selectorText}" — expected only .cls-N class rules`)
    }
    for (const className of classNames) {
      const merged = rules.get(className.slice(1)) ?? new Map<string, string>()
      for (const [prop, value] of declarations) merged.set(prop, value)
      rules.set(className.slice(1), merged)
    }
  }
  return rules
}

/** Properties an inline `style` attribute already declares — inline style beats CSS. */
function inlineStyleProps(style: string | undefined): ReadonlySet<string> {
  if (!style) return NO_PROPS
  const props = new Set<string>()
  for (const declaration of style.split(';')) {
    const colon = declaration.indexOf(':')
    if (colon !== -1 && declaration.slice(0, colon).trim()) {
      props.add(declaration.slice(0, colon).trim())
    }
  }
  return props
}

/** Concatenated text of every `<style>` element anywhere in the tree. */
function styleSheetText(root: XastRoot): string {
  let css = ''
  const walk = (node: XastRoot | XastElement): void => {
    for (const child of node.children) {
      if (child.type !== 'element') continue
      if (child.name === 'style') {
        css += child.children
          .map((content) =>
            content.type === 'text' || content.type === 'cdata' ? content.value : '',
          )
          .join('')
      } else {
        walk(child)
      }
    }
  }
  walk(root)
  return css
}

/**
 * Custom svgo plugin: resolve stylesheet classes onto each element as
 * presentation attributes. The CSS-resolved value overwrites a conflicting
 * presentation attribute (CSS beats attributes in the source cascade);
 * properties declared inline (`style` attribute) are left to the inline style.
 * Afterwards every `<style>` element and `class` attribute is removed, so the
 * later `prefixIds` pass only ever renames ids.
 */
const resolveStyleAttrs: { name: string; fn: Plugin<void> } = {
  name: 'resolve-style-attrs',
  fn: (root: XastRoot): Visitor => {
    const rules = parseClassRules(styleSheetText(root))
    return {
      element: {
        enter: (node: XastElement, parentNode: XastParent) => {
          if (node.name === 'style') {
            // filter (not splice) so svgo's in-flight traversals keep their cursor
            parentNode.children = parentNode.children.filter((child) => child !== node)
            return
          }
          const classNames = node.attributes.class?.split(/\s+/).filter(Boolean) ?? []
          if (node.attributes.class !== undefined) delete node.attributes.class
          if (classNames.length === 0) return
          const inline = inlineStyleProps(node.attributes.style)
          for (const className of classNames) {
            for (const [prop, value] of rules.get(className) ?? []) {
              if (!inline.has(prop)) node.attributes[prop] = value
            }
          }
        },
      },
    }
  },
}

/**
 * Process one scene asset. EXACTLY two svgo plugins — the style resolver above
 * and the built-in `prefixIds` with the given prefix. No preset-default:
 * mergePaths / collapseGroups / convertShapeToPath would destroy the SPEC §2
 * node-count ground truth (66 `<path>` + 1 sea `<rect>` + 1 land `<polygon>`).
 */
export function processSvg(raw: string, prefix: string): string {
  const { data } = optimize(raw, {
    plugins: [resolveStyleAttrs, { name: 'prefixIds', params: { prefix } }],
  })
  return data
}
