/**
 * DataBuff ChatBI role catalog shared by the host policy and the browser hero.
 *
 * The browser selects the active role; the host turns that selection into
 * model-facing context through the DSH context-injection channel
 * (`agent/pre-step` → `user/message` with a producer `source`). The directive
 * therefore never becomes part of the user's own message text.
 */

/** One selectable ChatBI role and the skill its directive loads. */
export interface ChatbiRole {
  /** Stable identifier reported by the browser and stored per session. */
  readonly key: string
  /** Short glyph rendered by the hero role bar. */
  readonly icon: string
  /** Model- and user-facing role name. */
  readonly label: string
  /** DSH skill the injected directive asks the model to load. */
  readonly skill: string
}

/** Roles offered by the hero role bar, in display order. */
export const CHATBI_ROLES: readonly ChatbiRole[] = [
  { key: 'query', icon: '\u25a5', label: '\u667a\u80fd\u95ee\u6570', skill: 'databuff-query' },
  { key: 'inspection', icon: '\u25c9', label: '\u667a\u80fd\u5de1\u68c0', skill: 'databuff-inspection' },
  { key: 'support', icon: '?', label: '\u4ea7\u54c1\u7b54\u7591', skill: 'databuff-product-support' },
  { key: 'operations', icon: '\u265f', label: '\u8fd0\u7ef4\u4e13\u5bb6', skill: 'databuff-operations' },
]

/** Role in force before the browser has reported a selection. */
export const DEFAULT_CHATBI_ROLE = 'query'

/**
 * Durable `MessageSourceMap` kind naming this plugin's injected context.
 *
 * `dsh-client-ui-chat` renders an unknown producer kind as an `inject` context
 * row labelled with the kind itself, so the plugin id doubles as the label.
 */
export const CHATBI_ROLE_SOURCE_KIND = 'databuff-role'

/**
 * Same-origin endpoint the browser reports the selected role to.
 *
 * Deliberately outside the DataBuff backend namespaces (`/webapi/*`,
 * `/databuff/*`) so a reverse proxy that forwards everything else to DSH keeps
 * routing it to the DSH web server.
 */
export const CHATBI_ROLE_SYNC_PATH = '/dsh-chatbi-role'

/** Validate the browser's role report before storing it for a session. */
export function parseChatbiRoleSyncPayload(value: unknown): {
  sessionId: string
  role: ChatbiRole
} | undefined {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return undefined
  const payload = value as Record<string, unknown>
  const sessionId = typeof payload.sessionId === 'string' ? payload.sessionId.trim() : ''
  const role = CHATBI_ROLES.find(item => item.key === payload.role)
  if (!sessionId || !role) return undefined
  return { sessionId, role }
}

/** Resolve a reported role key, falling back to the default role. */
export function resolveChatbiRole(key: unknown): ChatbiRole {
  return CHATBI_ROLES.find(role => role.key === key)
    ?? CHATBI_ROLES.find(role => role.key === DEFAULT_CHATBI_ROLE)
    ?? CHATBI_ROLES[0]!
}

/** Model-facing directive text injected as context for one role. */
export function roleDirectiveText(role: ChatbiRole): string {
  return [
    'DataBuff system role directive.',
    `Role: ${role.label}.`,
    `Before answering, load the ${role.skill} skill with the skill tool and follow that workflow.`,
  ].join(' ')
}

/** One-line account rendered on the collapsed context row. */
export function roleDirectiveSummary(role: ChatbiRole): string {
  return `DataBuff \u89d2\u8272\uff1a${role.label}`
}
