# Vercel cleanup candidates — review only

**Status:** no deletion or configuration change has been made.

| Candidate | Evidence | Action gate |
|---|---|---|
| Active non-production branches/deployments | Dashboard showed six of seven active branches. | Review owner/merge status and deployment traffic first. Never delete by age alone. |
| Production and `www` DNS recommendations | Dashboard recommends `A @ → 216.150.1.1` and `CNAME www → 057a678f07fe227c.vercel-dns-017.com.` while confirming legacy records continue to work. | Confirm the authoritative DNS zone; require explicit approval before editing DNS. |
| Preview-only provider and service-role configuration | Provider/sync and service-role variables were visible by name in Preview scope. | Keep if isolated Preview requires them; otherwise prove non-use and scope before removal. Never copy to Production or browser code. |
| Missing Deployment Checks | Dashboard says none configured. | Add only after the repository gate and expected workflow are reviewed; this is a release-hardening task, not a cleanup deletion. |

Ambiguous deployment history, domains, environment variables, integrations, and Git connections are intentionally **not** cleanup targets until an owner reviews their purpose.
