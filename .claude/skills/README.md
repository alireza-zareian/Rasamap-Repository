# Skills

Instructions an agent loads when a task matches a skill's `description`. The
four here are copied from their authors, read in full before they were added,
and pinned to a commit; each `SKILL.md` opens with a "Rasamap — read this
first" block that says where the skill meets a rule of this repository. That
block is the only change to the original text.

| Skill | Source | Licence | Use it for |
|---|---|---|---|
| `frontend-design` | anthropics/skills @ `8a1541c` | Apache-2.0 | a new page or surface: direction, type, restraint |
| `web-design-guidelines` | vercel-labs/web-interface-guidelines @ `e3d624b` | MIT | reviewing UI files for accessibility, focus, motion, forms |
| `react-best-practices` | vercel-labs/agent-skills @ `063bee9` | MIT | writing or reviewing React/Next.js code for performance |
| `react-view-transitions` | vercel-labs/agent-skills @ `063bee9` | MIT | anything touching `<ViewTransition>` |

Left out on purpose: `webapp-testing` (the repository has its own browser
suite, `npm run test:e2e`), the deploy skills (paid hosting, §0 of CLAUDE.md),
and skills for libraries this project does not use (shadcn/ui, Tailwind).

To update one, diff the new upstream text against the copy here and carry the
change by hand — a skill is instructions every future agent will follow, so no
text lands in this folder unread. The project's own workflows are the slash
commands in `.claude/commands/`.
