# Project Status

Give a concise status report of the Rasamap project.

Read `docs/STATUS.md` (the dated notes at the top) and the last rows of the
milestone log in `docs/engineering-decisions.md`, then run:
- `npm run lint` and `npm run build` to check for errors
- `git status` and `git log --oneline -10`

Report:
1. What changed most recently, and what is verified
2. What is built but dormant (SMS, Redis, PostgreSQL) or deliberately absent (booking, payment)
3. Any lint or build errors
4. Suggested next step

Remind the user to browse with `npm run demo`, not `npm run dev` (97× the CPU, §22).
