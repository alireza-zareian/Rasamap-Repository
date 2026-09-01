# Update Roadmap

Mark completed tasks and phases in `docs/roadmap.html`.

## Rules

**Completed task** (todo → done):
```html
<!-- BEFORE -->
<div class="task todo-t"><div class="tick"></div><div>...</div></div>
<!-- AFTER -->
<div class="task done-t"><div class="tick">✓</div><div>...</div></div>
```

**Phase fully done** (next/todo → done):
- `class="phase-card is-next"` → `class="phase-card is-done"`
- Badge: `<div class="ph-badge">✓ تموم شده</div>`
- Remove or replace old `<div class="note">` with `<div class="proof"><b>تأیید:</b> ...</div>`

**Phase now in progress** (no class → is-next):
- `class="phase-card"` → `class="phase-card is-next open"`
- Badge: `<div class="ph-badge">→ در جریان</div>`

**Footer**: update date to today in Jalali.

## What to mark done now

$ARGUMENTS

Read `docs/roadmap.html` first to find exact strings to replace, then apply changes with Edit tool.
