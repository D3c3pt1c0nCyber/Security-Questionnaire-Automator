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
    text = re.sub(r'<[^>]+>', ' ', text)
    text = html.unescape(text)
    text = re.sub(r'\s+', ' ', text).strip()
    return text

def get_page_body(page_id):
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
        return f"[Error: {e}]"

def search_confluence(query, limit=5):
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
        print(f"  [Search error]: {e}")
        return []

def extract_snippets(text, keywords, context=500, max_snippets=5):
    snippets = []
    text_lower = text.lower()
    for kw in keywords:
        kw_lower = kw.lower()
        start = 0
        while True:
            idx = text_lower.find(kw_lower, start)
            if idx == -1:
                break
            s = max(0, idx - context)
            e = min(len(text), idx + len(kw) + context)
            snippet = text[s:e].strip()
            if snippet not in snippets:
                snippets.append(snippet)
            start = idx + len(kw)
            if len(snippets) >= max_snippets:
                break
        if len(snippets) >= max_snippets:
            break
    return snippets

# =======================================================
# DEEP DIVE: Fetch specific high-value pages directly
# =======================================================

print("=" * 80)
print("DEEP DIVE: Fetching specific high-value pages")
print("=" * 80)

# 1. Continuous Monitoring Monthly Update (Feb 2026) - likely has security details
print("\n\n--- Page: 2026-02-24 Continuous Monitoring Monthly Update ---")
body = get_page_body("28279701514")
if body and not body.startswith("[Error"):
    for kw in ["SOC 2", "SOC2", "patch", "intrusion", "encryption", "audit", "onboarding", "offboarding",
                "retention", "backup", "SDLC", "physical", "access control", "policy", "change management",
                "vulnerability", "monitoring", "AES", "TLS"]:
        snips = extract_snippets(body, [kw], context=400, max_snippets=2)
        if snips:
            print(f"\n  [{kw}]:")
            for s in snips:
                print(f"    ...{s[:800]}...")
else:
    print(f"  {body}")

# 2. Jan 2026 Continuous Monitoring
print("\n\n--- Page: 2026-01-21 Continuous Monitoring Monthly Update ---")
body = get_page_body("28104032260")
if body and not body.startswith("[Error"):
    for kw in ["SOC 2", "SOC2", "patch", "intrusion", "encryption", "audit", "onboarding", "offboarding",
                "retention", "backup", "SDLC", "physical", "access control", "policy", "change management",
                "vulnerability", "monitoring", "AES", "TLS"]:
        snips = extract_snippets(body, [kw], context=400, max_snippets=2)
        if snips:
            print(f"\n  [{kw}]:")
            for s in snips:
                print(f"    ...{s[:800]}...")
else:
    print(f"  {body}")

# 3. Accessibility - Approach, Training, and Resources
print("\n\n--- Page: Accessibility - Approach, Training, and Resources ---")
body = get_page_body("27758526839")
if body and not body.startswith("[Error"):
    # Print a generous portion
    print(f"  Content (first 3000 chars):\n  {body[:3000]}")
    snips = extract_snippets(body, ["VPAT", "WCAG", "roadmap", "timeline", "remediat", "Target Solutions", "accessibility"], context=500, max_snippets=5)
    if snips:
        print("\n  Key snippets:")
        for i, s in enumerate(snips, 1):
            print(f"\n  Snippet {i}: ...{s[:800]}...")
else:
    print(f"  {body}")

# 4. ADA Compliance page
print("\n\n--- Page: ADA Compliance ---")
body = get_page_body("6431081053")
if body and not body.startswith("[Error"):
    print(f"  Content (first 3000 chars):\n  {body[:3000]}")
else:
    print(f"  {body}")

# 5. Client Request: ADA Compliance
print("\n\n--- Page: Client Request: ADA Compliance ---")
body = get_page_body("9682190023")
if body and not body.startswith("[Error"):
    print(f"  Content (first 3000 chars):\n  {body[:3000]}")
else:
    print(f"  {body}")

# 6. GIST Data Policy (may have retention info)
print("\n\n--- Page: GIST Data Policy ---")
body = get_page_body("9571370036")
if body and not body.startswith("[Error"):
    snips = extract_snippets(body, ["retention", "backup", "data", "delete", "purge", "archive"], context=400, max_snippets=5)
    if snips:
        for i, s in enumerate(snips, 1):
            print(f"\n  Snippet {i}: ...{s[:800]}...")
    else:
        print(f"  Content (first 2000 chars):\n  {body[:2000]}")
else:
    print(f"  {body}")

# 7. AWS Backup Vaults and Restoration
print("\n\n--- Page: AWS Backup Vaults and Restoration ---")
body = get_page_body("837255505")
if body and not body.startswith("[Error"):
    print(f"  Content (first 3000 chars):\n  {body[:3000]}")
else:
    print(f"  {body}")

# 8. Red Vector Backup Details
print("\n\n--- Page: Red Vector Backup Details ---")
body = get_page_body("875200767")
if body and not body.startswith("[Error"):
    print(f"  Content (first 3000 chars):\n  {body[:3000]}")
else:
    print(f"  {body}")

# 9. AWS Deployment Procedures (may have IDS/IPS info)
print("\n\n--- Page: AWS Deployment Procedures ---")
body = get_page_body("471695431")
if body and not body.startswith("[Error"):
    snips = extract_snippets(body, ["IDS", "IPS", "intrusion", "monitoring", "firewall", "WAF", "security group", "guard"], context=400, max_snippets=5)
    if snips:
        for i, s in enumerate(snips, 1):
            print(f"\n  Snippet {i}: ...{s[:800]}...")
    else:
        print(f"  Content (first 2000 chars):\n  {body[:2000]}")
else:
    print(f"  {body}")

# 10. Vector Scheduling Service Security and Redundancy
print("\n\n--- Page: Vector Scheduling Service Security and Redundancy ---")
body = get_page_body("27874558050")
if body and not body.startswith("[Error"):
    print(f"  Content (first 4000 chars):\n  {body[:4000]}")
else:
    print(f"  {body}")

# 11. Detailed Feature Description (had AES-256/TLS results)
print("\n\n--- Page: Detailed Feature Description ---")
body = get_page_body("5085821767")
if body and not body.startswith("[Error"):
    snips = extract_snippets(body, ["AES", "TLS", "encrypt", "256", "SSL", "security"], context=400, max_snippets=5)
    if snips:
        for i, s in enumerate(snips, 1):
            print(f"\n  Snippet {i}: ...{s[:800]}...")
    else:
        print(f"  Content (first 2000 chars):\n  {body[:2000]}")
else:
    print(f"  {body}")

# 12. Application Code Security Scan Findings and Remediation (may have SDLC details)
print("\n\n--- Page: Application Code Security Scan Findings and Remediation ---")
body = get_page_body("6515393709")
if body and not body.startswith("[Error"):
    print(f"  Content (first 3000 chars):\n  {body[:3000]}")
else:
    print(f"  {body}")

# 13. FileWatcher - Importing Data, Encryption and Decryption
print("\n\n--- Page: FileWatcher - Importing Data, Encryption and Decryption ---")
body = get_page_body("6418694196")
if body and not body.startswith("[Error"):
    snips = extract_snippets(body, ["AES", "encrypt", "TLS", "key", "256", "cipher", "decrypt"], context=400, max_snippets=5)
    if snips:
        for i, s in enumerate(snips, 1):
            print(f"\n  Snippet {i}: ...{s[:800]}...")
    else:
        print(f"  Content (first 2000 chars):\n  {body[:2000]}")
else:
    print(f"  {body}")

# ========================================================
# Additional targeted searches
# ========================================================
print("\n\n" + "=" * 80)
print("ADDITIONAL TARGETED SEARCHES")
print("=" * 80)

# Search for Vector Solutions security-specific pages
for query_label, query in [
    ("SOC 2 Type II", "SOC 2 Type II"),
    ("trust service criteria", "trust service criteria"),
    ("privacy principle", "privacy principle"),
    ("penetration test", "penetration test"),
    ("VPAT remediation", "VPAT remediation"),
    ("WCAG compliance", "WCAG compliance"),
    ("encryption at rest", "encryption at rest"),
    ("encryption in transit", "encryption in transit"),
    ("security awareness training", "security awareness training"),
    ("incident response", "incident response plan"),
    ("disaster recovery", "disaster recovery"),
    ("RPO RTO", "RPO RTO"),
    ("code review security", "code review security"),
    ("SAST DAST", "SAST DAST"),
    ("vulnerability scanning", "vulnerability scanning"),
    ("access termination", "access revocation termination"),
    ("background check", "background check employee"),
]:
    results = search_confluence(query, limit=3)
    if results:
        print(f"\n  [{query_label}] Found {len(results)} results:")
        for r in results:
            print(f"    - [{r.get('id')}] {r.get('title', '')}")
        # Fetch first result if it looks relevant (not attachment)
        first = results[0]
        pid = first.get("id", "")
        if not pid.startswith("att"):
            body = get_page_body(pid)
            if body and not body.startswith("[Error"):
                search_terms = query.lower().split()
                snips = extract_snippets(body, search_terms, context=300, max_snippets=2)
                if snips:
                    for s in snips:
                        print(f"      ...{s[:600]}...")
    else:
        print(f"\n  [{query_label}] No results")

# Search for the "g" page which appeared in SOC 2 results - it may be a security questionnaire
print("\n\n--- Page: 'g' (appeared in SOC 2 search) ---")
body = get_page_body("27878195208")
if body and not body.startswith("[Error"):
    snips = extract_snippets(body, ["SOC", "privacy", "trust", "security", "encryption", "audit", "patch",
                                     "intrusion", "SDLC", "retention", "physical", "onboard", "offboard",
                                     "change management", "VPAT", "accessibility"], context=400, max_snippets=10)
    if snips:
        print(f"  Found {len(snips)} relevant snippets:")
        for i, s in enumerate(snips, 1):
            print(f"\n  Snippet {i}: ...{s[:800]}...")
    else:
        print(f"  Content (first 5000 chars):\n  {body[:5000]}")
else:
    print(f"  {body}")

print("\n\n" + "=" * 80)
print("DEEP DIVE COMPLETE")
print("=" * 80)
