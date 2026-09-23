const QUESTIONS = [
  '查询最近1小时的服务列表和健康状态',
  '查询核心服务的上下游调用拓扑',
  '查询各服务最近1小时的请求量趋势',
  '查询各服务最近1小时的异常量趋势',
  '分析最近30分钟响应时间最高的服务',
  '查询服务器CPU、内存和磁盘使用趋势',
  '检查JVM堆内存、GC和线程指标',
  '生成当前系统健康巡检HTML报告',
]

const GREETINGS = [
  '\u55e8\uff01\u4eca\u5929\u60f3\u804a\u4e9b\u4ec0\u4e48\uff1f',
  '\u60a8\u597d\uff0c\u6709\u4ec0\u4e48\u53ef\u4ee5\u5e2e\u60a8\uff1f',
  '\u4eca\u5929\u60f3\u4ece\u54ea\u9879\u6570\u636e\u5f00\u59cb\uff1f',
  '\u9700\u8981\u6211\u5e2e\u60a8\u5de1\u68c0\u54ea\u4e2a\u670d\u52a1\uff1f',
  '\u60f3\u5148\u770b\u770b\u6307\u6807\u3001\u65e5\u5fd7\u8fd8\u662f\u94fe\u8def\uff1f',
  '\u9047\u5230\u4ec0\u4e48\u8fd0\u884c\u95ee\u9898\u4e86\uff1f',
  '\u4eca\u5929\u60f3\u5206\u6790\u54ea\u4e2a\u670d\u52a1\uff1f',
  '\u51c6\u5907\u597d\u4e86\uff0c\u4e00\u8d77\u5b9a\u4f4d\u95ee\u9898\u5427\uff01',
]

function randomGreeting(except?: string): string {
  const candidates = GREETINGS.filter(item => item !== except)
  return candidates[Math.floor(Math.random() * candidates.length)] ?? GREETINGS[0]!
}

const CAPABILITIES = [
  ['1', '看得见', '自然语言问系统'],
  ['2', '会巡检', '服务巡检与报告'],
  ['3', '会诊断', '指标日志链路分析'],
  ['4', '会定位', '关联根因分析'],
  ['5', '会报告', '生成可视化报告'],
  ['6', '会预测', '容量与趋势研判'],
  ['7', '会答疑', 'DataBuff产品答疑'],
] as const

const ROLE_PROFILES = [
  { key: 'query', icon: '\u25a5', label: '\u667a\u80fd\u95ee\u6570', skill: 'databuff-query' },
  { key: 'inspection', icon: '\u25c9', label: '\u667a\u80fd\u5de1\u68c0', skill: 'databuff-inspection' },
  { key: 'support', icon: '?', label: '\u4ea7\u54c1\u7b54\u7591', skill: 'databuff-product-support' },
  { key: 'operations', icon: '\u265f', label: '\u8fd0\u7ef4\u4e13\u5bb6', skill: 'databuff-operations' },
] as const

type RoleKey = typeof ROLE_PROFILES[number]['key']

let selectedRole: RoleKey = 'query'

/**
 * Add a model-facing role directive only at the transport boundary. The HTML
 * comment stays out of the composer and is not rendered in the user bubble.
 */
export function withSelectedRolePrompt(body: string): string {
  if (!body.trim()) return body
  const roleKey = selectedRole
  const role = ROLE_PROFILES.find(item => item.key === roleKey) ?? ROLE_PROFILES[0]
  const directive = [
    'DataBuff system role directive.',
    `Role: ${role.label}.`,
    `Before answering, load the ${role.skill} skill with the skill tool and follow that workflow.`,
    'Treat the text after this comment as the complete user-visible request.',
  ].join(' ')
  return `<!-- ${directive} -->\n${body}`
}

function setComposerText(root: Element, text: string): void {
  const input = root.querySelector('[data-composer-input="true"], textarea')
  if (input instanceof HTMLTextAreaElement) {
    const setter = Object.getOwnPropertyDescriptor(HTMLTextAreaElement.prototype, 'value')?.set
    setter?.call(input, text)
    input.dispatchEvent(new Event('input', { bubbles: true }))
    input.dispatchEvent(new Event('change', { bubbles: true }))
    input.focus()
    return
  }
  if (input instanceof HTMLElement && input.isContentEditable) {
    input.focus()
    document.execCommand('selectAll', false)
    document.execCommand('insertText', false, text)
  }
}

function renderQuestions(panel: HTMLElement, offset: number): void {
  const list = panel.querySelector('[data-databuff-questions]')
  if (!(list instanceof HTMLElement)) return
  list.replaceChildren(...Array.from({ length: 4 }, (_, index) => {
    const question = QUESTIONS[(offset + index) % QUESTIONS.length]!
    const button = document.createElement('button')
    button.type = 'button'
    button.className = 'databuff-question'
    button.dataset.question = question
    const badge = document.createElement('span')
    badge.textContent = String(index + 1)
    const label = document.createElement('b')
    label.textContent = question
    const arrow = document.createElement('i')
    arrow.textContent = '›'
    button.append(badge, label, arrow)
    return button
  }))
}

function createRoleBar(root: Element): HTMLElement {
  const bar = document.createElement('div')
  bar.className = 'databuff-role-bar'
  bar.dataset.databuffRoles = ''
  const selected = (root.getAttribute('data-databuff-role') || 'query') as RoleKey
  selectedRole = selected
  root.setAttribute('data-databuff-role', selected)
  for (const role of ROLE_PROFILES) {
    const button = document.createElement('button')
    button.type = 'button'
    button.dataset.role = role.key
    button.dataset.skill = role.skill
    button.setAttribute('aria-pressed', String(role.key === selected))
    button.innerHTML = `<span>${role.icon}</span>${role.label}`
    bar.appendChild(button)
  }
  bar.addEventListener('click', (event) => {
    const button = event.target instanceof Element
      ? event.target.closest<HTMLButtonElement>('[data-role]')
      : null
    const role = button?.dataset.role as RoleKey | undefined
    if (!role) return
    selectedRole = role
    root.setAttribute('data-databuff-role', role)
    for (const item of bar.querySelectorAll<HTMLButtonElement>('[data-role]')) {
      item.setAttribute('aria-pressed', String(item === button))
    }
  })
  return bar
}

function createPanel(root: Element): HTMLElement {
  const panel = document.createElement('section')
  panel.className = 'databuff-hero'
  panel.dataset.databuffHero = ''

  const title = document.createElement('div')
  title.className = 'databuff-capability-title'
  title.textContent = 'DataBuff · ChatBI 智能可观测'

  const flow = document.createElement('div')
  flow.className = 'databuff-capability-flow'
  for (const [number, name, description] of CAPABILITIES) {
    const card = document.createElement('div')
    card.className = 'databuff-capability-card'
    card.innerHTML = `<span>${number}</span><strong>${name}</strong><small>${description}</small>`
    flow.appendChild(card)
  }

  const orb = document.createElement('div')
  orb.className = 'databuff-orb'
  const heading = document.createElement('h1')
  heading.textContent = randomGreeting()
  const subheading = document.createElement('p')
  subheading.textContent = '查询服务、指标、日志与链路，或生成一份可重复查看的分析报告'

  const suggestions = document.createElement('div')
  suggestions.className = 'databuff-suggestions'
  const suggestionsHeader = document.createElement('div')
  suggestionsHeader.className = 'databuff-suggestions-header'
  suggestionsHeader.innerHTML = '<strong>推荐问题</strong>'
  const refresh = document.createElement('button')
  refresh.type = 'button'
  refresh.textContent = '换一批'
  suggestionsHeader.appendChild(refresh)
  const list = document.createElement('div')
  list.className = 'databuff-question-grid'
  list.dataset.databuffQuestions = ''
  suggestions.append(suggestionsHeader, list)

  let offset = 0
  refresh.addEventListener('click', () => {
    offset = (offset + 4) % QUESTIONS.length
    renderQuestions(panel, offset)
    heading.textContent = randomGreeting(heading.textContent ?? undefined)
  })
  list.addEventListener('click', (event) => {
    const button = event.target instanceof Element ? event.target.closest<HTMLButtonElement>('[data-question]') : null
    if (button?.dataset.question) {
      setComposerText(root, button.dataset.question)
    }
  })

  panel.append(title, flow, orb, heading, subheading, suggestions)
  renderQuestions(panel, offset)
  return panel
}

export function mountDataBuffHero(): () => void {
  const style = document.createElement('style')
  style.id = 'databuff-chatbi-hero-style'
  style.textContent = `
    [data-phase="hero"] { background: radial-gradient(circle at 12% 6%,#e7ebff 0,transparent 34%),radial-gradient(circle at 86% 18%,#e4f8f3 0,transparent 32%),#f8faff; }
    [data-phase="hero"] [data-conversation-scroll] { justify-content:flex-start!important; padding-top:36px!important; }
    [data-phase="hero"] [data-composer-seat] { margin-top:14px!important; }
    [data-phase="hero"] [class*="heroWorkspaceRow"] > button[aria-haspopup="menu"]:first-child { display:none!important; }
    [data-phase="hero"] [class*="heroWorkspaceRow"]:empty { display:none!important; }
    .databuff-hero { width:min(1180px,calc(100% - 48px)); margin:0 auto; color:#12213b; font-family:Inter,"Microsoft YaHei",system-ui,sans-serif; }
    .databuff-capability-title { width:max-content; margin:0 auto 20px; padding:8px 22px; border:1px solid #c8b8ff; border-radius:999px; background:#eee9ff; color:#5033a5; font-weight:750; letter-spacing:.5px; }
    .databuff-capability-flow { display:grid; grid-template-columns:repeat(7,minmax(94px,1fr)); gap:14px; align-items:stretch; }
    .databuff-capability-card { position:relative; min-height:88px; padding:14px 8px 10px; border:1px solid #cbd7eb; border-radius:15px; background:rgba(255,255,255,.72); text-align:center; box-shadow:0 8px 24px rgba(67,83,130,.06); }
    .databuff-capability-card:not(:last-child)::after { content:'→'; position:absolute; right:-13px; top:34px; color:#91a0b8; }
    .databuff-capability-card span { display:grid; place-items:center; width:23px; height:23px; margin:0 auto 7px; border-radius:50%; background:#7250e8; color:white; font-size:12px; font-weight:800; }
    .databuff-capability-card strong,.databuff-capability-card small { display:block; }
    .databuff-capability-card strong { font-size:14px; }
    .databuff-capability-card small { margin-top:4px; color:#64748b; font-size:11px; }
    .databuff-orb { position:relative; width:78px; height:78px; margin:28px auto 12px; overflow:hidden; border:1px solid rgba(164,187,255,.7); border-radius:50%; background:radial-gradient(circle at 34% 28%,rgba(255,255,255,.96) 0 8%,rgba(163,231,255,.82) 21%,rgba(120,96,238,.9) 48%,rgba(66,196,225,.72) 68%,rgba(238,245,255,.96) 100%); box-shadow:inset -10px -12px 22px rgba(56,55,178,.25),inset 8px 8px 18px rgba(255,255,255,.8),0 0 12px #fff,0 0 42px rgba(111,155,255,.55); animation:databuff-orb-float 4s ease-in-out infinite; }
    .databuff-orb::before,.databuff-orb::after { content:''; position:absolute; border-radius:45% 55% 60% 40%; filter:blur(5px); mix-blend-mode:screen; }
    .databuff-orb::before { inset:9px; border-radius:50%; background:conic-gradient(from 210deg,#7448d7 0 18%,#a77bff 32%,#82e5f4 46%,#7043d2 63%,#e9a5ff 78%,#7448d7 100%); opacity:.9; animation:databuff-crystal-orbit 5s linear infinite; }
    .databuff-orb::after { width:26px; height:26px; left:50%; top:50%; transform:translate(-50%,-50%); background:radial-gradient(circle at 34% 29%,rgba(255,255,255,.98) 0 17%,rgba(255,255,255,.78) 34%,rgba(198,231,255,.42) 59%,rgba(255,255,255,0) 78%); box-shadow:0 0 12px rgba(255,255,255,.9),0 0 20px rgba(208,191,255,.55); animation:databuff-spot-pulse 3.4s ease-in-out infinite; }
    @keyframes databuff-crystal-orbit { 0% { transform:rotate(0deg) scale(.95); } 50% { transform:rotate(180deg) scale(1.06); } 100% { transform:rotate(360deg) scale(.95); } }
    @keyframes databuff-spot-pulse { 0%,100% { transform:translate(-50%,-50%) scale(.86); opacity:.78; } 50% { transform:translate(-50%,-50%) scale(1.08); opacity:1; } }
    @keyframes databuff-orb-float { 50% { transform:translateY(-5px); box-shadow:inset -12px -10px 25px rgba(56,55,178,.3),inset 9px 9px 20px rgba(255,255,255,.85),0 0 14px #fff,0 0 52px rgba(128,117,255,.65); } }
    .databuff-hero h1 { margin:0; text-align:center; color:#07152f; font-size:30px; line-height:1.35; }
    .databuff-hero>p { margin:8px 0 0; text-align:center; color:#718096; font-size:13px; }
    .databuff-suggestions { margin-top:22px; }
    .databuff-suggestions-header { display:flex; justify-content:space-between; align-items:center; margin-bottom:10px; }
    .databuff-suggestions-header button { border:0; background:transparent; color:#4769da; cursor:pointer; }
    .databuff-question-grid { display:grid; grid-template-columns:1fr 1fr; gap:10px 14px; }
    .databuff-question { display:grid; grid-template-columns:25px 1fr 16px; align-items:center; gap:9px; min-height:54px; padding:8px 14px; border:1px solid #dce3f2; border-radius:13px; background:rgba(255,255,255,.9); color:#283953; text-align:left; cursor:pointer; box-shadow:0 8px 24px rgba(45,62,100,.05); }
    .databuff-question:hover { border-color:#9fb4ff; transform:translateY(-1px); }
    .databuff-question span { display:grid; place-items:center; width:23px; height:23px; border-radius:7px; background:#edf2ff; color:#526de8; font-size:12px; }
    .databuff-question b { font-size:13px; font-weight:550; }
    .databuff-question i { color:#8da0bd; font-style:normal; font-size:20px; }
    .databuff-role-bar { display:flex; align-items:center; gap:8px; width:min(var(--dsh-composer-card-max-width),calc(100% - 32px)); margin:0 auto; padding:2px 8px 0; }
    .databuff-role-bar button { display:inline-flex; align-items:center; gap:6px; padding:7px 11px; border:0; border-radius:999px; background:rgba(255,255,255,.72); color:#40506a; font-size:12px; white-space:nowrap; cursor:pointer; box-shadow:0 1px 8px rgba(50,70,120,.05); }
    .databuff-role-bar button:hover { background:#edf2ff; color:#3659c8; }
    .databuff-role-bar button[aria-pressed="true"] { background:#e9edff; color:#294fc2; box-shadow:inset 0 0 0 1px #b9c7ff,0 4px 14px rgba(65,87,190,.12); }
    .databuff-role-bar span { display:inline-grid; place-items:center; min-width:15px; height:15px; color:#314462; font-size:12px; font-weight:700; }
    @media(max-width:900px){.databuff-capability-flow{grid-template-columns:repeat(4,1fr)}.databuff-capability-card:nth-child(n+5){display:none}.databuff-question-grid{grid-template-columns:1fr}.databuff-hero{width:calc(100% - 24px)}}
  `
  document.head.appendChild(style)

  const sync = () => {
    for (const root of document.querySelectorAll('[data-phase="hero"]')) {
      const seat = root.querySelector('[data-composer-seat]')
      if (!seat) continue
      if (!root.querySelector('[data-databuff-hero]')) {
        seat.parentElement?.insertBefore(createPanel(root), seat)
      }
      const stack = seat.firstElementChild
      if (stack instanceof HTMLElement && !stack.querySelector('[data-databuff-roles]')) {
        stack.appendChild(createRoleBar(root))
      }
    }
    for (const root of document.querySelectorAll('[data-phase="hero"]')) {
      for (const node of root.querySelectorAll('span')) {
        if (node.textContent?.trim() === '\u63a2\u7d22\u672a\u81f3\u4e4b\u5883') {
          const shell = node.parentElement?.parentElement?.parentElement
          if (shell) shell.style.display = 'none'
        }
      }
    }
    for (const panel of document.querySelectorAll('[data-databuff-hero]')) {
      if (!panel.closest('[data-phase="hero"]')) panel.remove()
    }
    for (const roles of document.querySelectorAll('[data-databuff-roles]')) {
      if (!roles.closest('[data-phase="hero"]')) roles.remove()
    }
  }
  const observer = new MutationObserver(sync)
  observer.observe(document.body, { childList: true, subtree: true, attributes: true, attributeFilter: ['data-phase'] })
  sync()
  return () => {
    observer.disconnect()
    style.remove()
    document.querySelectorAll('[data-databuff-hero]').forEach(node => node.remove())
    document.querySelectorAll('[data-databuff-roles]').forEach(node => node.remove())
  }
}
