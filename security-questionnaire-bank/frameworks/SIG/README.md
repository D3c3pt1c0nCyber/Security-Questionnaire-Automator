# SIG — Standardized Information Gathering (Shared Assessments)

## Version History
SIG is updated annually by Shared Assessments.

### SIG 2026 (Latest)
- Annual update with latest regulatory mappings
- **Core** — Full assessment (~627 questions)
- **Lite** — Abbreviated (~128 questions)

### SIG 2025
- Added: EU DORA, EU NIS2, NIST CSF 2.0 mappings
- **Core** — 627 questions
- **Lite** — 128 questions

## SIG Tiers
| Tier | Questions | Use Case |
|------|-----------|----------|
| **Lite** | ~128 | Basic vendor assessment, lower-risk vendors |
| **Core** | ~627 | Vendors handling sensitive/regulated data |
| **Detail** | ~1,936 | Deepest assessment (rarely used) |

## Folder Structure
```
SIG/
├── 2026/
│   ├── templates/
│   │   ├── Core/           ← Blank SIG Core 2026 template
│   │   └── Lite/           ← Blank SIG Lite 2026 template
│   └── completed/
│       ├── Core/           ← Answered SIG Core 2026 questionnaires
│       └── Lite/           ← Answered SIG Lite 2026 questionnaires
└── 2025/
    ├── templates/
    │   ├── Core/
    │   └── Lite/
    └── completed/
        ├── Core/
        └── Lite/
```

## Downloading SIG Templates
SIG templates require a **Shared Assessments membership**.
1. Go to https://sharedassessments.org/sig/
2. Log in with your membership credentials
3. Download the SIG Core and/or SIG Lite for the desired year
4. Place files in the matching `templates/Core/` or `templates/Lite/` folder

## Naming Convention
`YYYY-MM-DD-[ProductName]-SIG-[tier]-[year].ext`

Examples:
- `2026/completed/Core/2026-02-26-SafeLMS-SIG-Core-2026.xlsx`
- `2025/completed/Lite/2025-09-15-TargetSolutions-SIG-Lite-2025.xlsx`

## 18 SIG Domains
1. Enterprise Risk Management
2. Security Policy
3. Organizational Security
4. Asset & Info Management
5. Human Resource Security
6. Physical & Environmental Security
7. IT Operations Management
8. Access Control
9. Application Security
10. Cybersecurity Incident Mgmt
11. Operational Resilience
12. Compliance & Operational Risk
13. Endpoint Device Security
14. Network Security
15. Privacy
16. Threat Management
17. Server Security
18. Cloud Hosting Services
