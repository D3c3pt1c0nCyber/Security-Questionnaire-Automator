import sys
sys.stdout.reconfigure(encoding="utf-8", errors="replace")

import urllib.request
import urllib.parse
import json
import base64
import re
import html

# Auth setup
email = "joie.sayen@vectorsolutions.com"
token = "ATATT3xFfGF0aIpfzcrTSIMEizNJQEHxmUTEH1wOLkOVqDULSq9TJKU0BJrxjcj2okYxHXKAzQ0SbWsP6m64GFjVhIUefaC6SYNYBeATovIgYYhSZwvvjFdWojzBAXZO28kjHGuk0YgrWyI2cDY7TaWiCOn9uFbZm-NCKhcpPlLyVPcvJ0BvzLQ=A5D62EDB"
credentials = base64.b64encode(f"{email}:{token}".encode()).decode()
base_url = "https://lmsportal.atlassian.net/wiki/rest/api"

def strip_html(text):
    """Remove HTML tags and decode entities."""
    text = re.sub(r'<[^>]+>', ' ', text)
    text = html.unescape(text)
    text = re.sub(r'\s+', ' ', text).strip()
    return text

def search_confluence(query, limit=5):
    """Search Confluence using CQL."""
    cql = f'text~"{query}"'
    url = f"{base_url}/content/search?cql={urllib.parse.quote(cql)}&limit={limit}"
    req = urllib.request.Request(url)
    req.add_header("Authorization", f"Basic {credentials}")
    req.add_header("Accept", "application/json")
    try:
        with urllib.request.urlopen(req, timeout=30) as resp:
            data = json.loads(resp.read().decode("utf-8"))
            return data.get("results", [])
    except Exception as e:
        print(f"  [Search error for '{query}']: {e}")
        return []

def get_page_body(page_id):
    """Get page body content."""
    url = f"{base_url}/content/{page_id}?expand=body.storage"
    req = urllib.request.Request(url)
    req.add_header("Authorization", f"Basic {credentials}")
    req.add_header("Accept", "application/json")
    try:
        with urllib.request.urlopen(req, timeout=30) as resp:
            data = json.loads(resp.read().decode("utf-8"))
            raw = data.get("body", {}).get("storage", {}).get("value", "")
            return strip_html(raw)
    except Exception as e:
        return f"[Error fetching page {page_id}]: {e}"

def extract_relevant_snippets(text, keywords, context_chars=400):
    """Extract snippets around keyword matches."""
    snippets = []
    text_lower = text.lower()
    for kw in keywords:
        kw_lower = kw.lower()
        start = 0
        while True:
            idx = text_lower.find(kw_lower, start)
            if idx == -1:
                break
            snippet_start = max(0, idx - context_chars)
            snippet_end = min(len(text), idx + len(kw) + context_chars)
            snippet = text[snippet_start:snippet_end].strip()
            if snippet and snippet not in snippets:
                snippets.append(snippet)
            start = idx + len(kw)
            if len(snippets) >= 3:
                break
        if len(snippets) >= 3:
            break
    return snippets

def search_topic(topic_name, search_queries, extract_keywords):
    """Search for a topic using multiple queries and extract relevant info."""
    print(f"\n{'='*80}")
    print(f"TOPIC: {topic_name}")
    print(f"{'='*80}")

    all_pages = {}
    for query in search_queries:
        print(f"\n  Searching: \"{query}\"")
        results = search_confluence(query)
        print(f"  Found {len(results)} results")
        for r in results:
            pid = r.get("id")
            title = r.get("title", "")
            if pid not in all_pages:
                all_pages[pid] = title
                print(f"    - [{pid}] {title}")

    if not all_pages:
        print("\n  ** NO RESULTS FOUND **")
        return

    # Fetch and extract from top pages (limit to first 5 unique)
    print(f"\n  --- Extracting relevant content from {min(len(all_pages), 5)} pages ---")
    found_anything = False
    for pid, title in list(all_pages.items())[:5]:
        body = get_page_body(pid)
        if not body or body.startswith("[Error"):
            print(f"\n  Page: {title} - {body}")
            continue
        snippets = extract_relevant_snippets(body, extract_keywords)
        if snippets:
            found_anything = True
            print(f"\n  Page: \"{title}\"")
            for i, snip in enumerate(snippets, 1):
                # Truncate very long snippets
                if len(snip) > 800:
                    snip = snip[:800] + "..."
                print(f"    Snippet {i}: ...{snip}...")
        else:
            # If no keyword match, show first 500 chars as context
            preview = body[:500]
            if "target" in body.lower() or "solution" in body.lower():
                found_anything = True
                print(f"\n  Page: \"{title}\" (preview)")
                print(f"    {preview}...")

    if not found_anything:
        print("\n  ** No relevant snippets found in returned pages **")


# ============================================================
# TOPIC SEARCHES
# ============================================================

print("=" * 80)
print("CONFLUENCE SEARCH: Target Solutions HECVAT Topics")
print("=" * 80)

# 1. SOC 2 / Privacy Trust Service Principle
search_topic(
    "1. Target Solutions SOC 2 - Privacy Trust Service Principle",
    ["Target Solutions SOC 2", "SOC 2 privacy trust", "Target Solutions SOC"],
    ["SOC 2", "SOC2", "privacy", "trust service", "security", "confidentiality", "availability"]
)

# 2. Accessibility / VPAT
search_topic(
    "2. Target Solutions Accessibility / VPAT",
    ["Target Solutions accessibility", "Target Solutions VPAT", "VPAT accessibility"],
    ["accessibility", "VPAT", "WCAG", "508", "ADA", "screen reader"]
)

# 3. Accessibility Roadmap
search_topic(
    "3. Target Solutions Accessibility Roadmap",
    ["Target Solutions accessibility roadmap", "accessibility roadmap timeline", "accessibility remediation plan"],
    ["roadmap", "timeline", "accessibility", "remediation", "milestone", "plan"]
)

# 4. Patch Management
search_topic(
    "4. Target Solutions Patch Management",
    ["Target Solutions patch management", "patch management process", "vulnerability patching"],
    ["patch", "patching", "vulnerability", "update", "critical", "remediation", "days"]
)

# 5. Intrusion Monitoring
search_topic(
    "5. Target Solutions Intrusion Monitoring",
    ["Target Solutions intrusion monitoring", "intrusion detection", "IDS IPS monitoring"],
    ["intrusion", "IDS", "IPS", "monitoring", "detection", "SIEM", "third-party", "internal", "SOC"]
)

# 6. Employee Onboarding/Offboarding
search_topic(
    "6. Target Solutions Employee Onboarding/Offboarding",
    ["Target Solutions employee onboarding", "onboarding offboarding", "employee termination access"],
    ["onboarding", "offboarding", "termination", "access", "revoke", "background check", "new hire"]
)

# 7. Encryption Standards
search_topic(
    "7. Target Solutions Encryption Standards",
    ["Target Solutions encryption", "encryption standards", "AES-256 TLS"],
    ["encryption", "AES", "TLS", "256", "at rest", "in transit", "cipher", "SSL", "key management"]
)

# 8. Information Security Policy
search_topic(
    "8. Target Solutions Information Security Policy",
    ["Target Solutions information security policy", "security policy document", "information security program"],
    ["security policy", "information security", "policy", "reviewed", "approved", "annual"]
)

# 9. Change Management / Software Updates
search_topic(
    "9. Target Solutions Change Management / Software Updates",
    ["Target Solutions change management", "software updates", "change control process"],
    ["change management", "change control", "update", "deployment", "approval", "downtime", "institutional"]
)

# 10. Audit Logs
search_topic(
    "10. Target Solutions Audit Logs",
    ["Target Solutions audit logs", "audit logging", "log monitoring"],
    ["audit log", "logging", "log", "event", "capture", "monitor", "access", "trail"]
)

# 11. SDLC
search_topic(
    "11. Target Solutions SDLC / Development Lifecycle",
    ["Target Solutions SDLC", "development lifecycle", "secure development"],
    ["SDLC", "development lifecycle", "code review", "testing", "QA", "security testing", "SAST", "DAST"]
)

# 12. Data Retention / Backup
search_topic(
    "12. Target Solutions Data Retention / Backup",
    ["Target Solutions data retention", "backup retention", "data backup policy"],
    ["retention", "backup", "restore", "recovery", "RPO", "RTO", "days", "years"]
)

# 13. Physical Security
search_topic(
    "13. Target Solutions Physical Security",
    ["Target Solutions physical security", "data center security", "physical access controls"],
    ["physical", "data center", "badge", "biometric", "camera", "guard", "facility", "AWS", "Azure"]
)

# 14. Internal Audit
search_topic(
    "14. Target Solutions Internal Audit",
    ["Target Solutions internal audit", "internal audit process", "security audit"],
    ["internal audit", "audit", "assessment", "review", "annual", "compliance", "findings"]
)

print("\n\n" + "=" * 80)
print("SEARCH COMPLETE")
print("=" * 80)
