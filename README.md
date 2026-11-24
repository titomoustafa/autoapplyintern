# Auto Apply

Nightly bot that finds jobs, scores fit, and applies — with a morning "Needs you" queue for the rest.

- Design and milestones: [docs/PLAN.md](docs/PLAN.md)
- Operating it: [RUNBOOK.md](RUNBOOK.md)
- Picking this up? Start with [HANDOFF.md](HANDOFF.md)
- Rules for coding agents: [AGENTS.md](AGENTS.md)

```bash
npm install
npm test
npm run worker -- --companies 40   # quick local run
npm run dev                        # dashboard on :3000
```
