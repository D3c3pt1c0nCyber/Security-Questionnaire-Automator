import sys
sys.stdout.reconfigure(encoding="utf-8", errors="replace")

import urllib.request
import urllib.parse
import json
import base64
import re
import html

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

print("=" * 80)
print("TARGETED DEEP DIVE - Target Solutions Specific Pages")
print("=" * 80)

# 1. Target Solutions - Architecture page (27024097297)
print("\n\n--- Page: Target Solutions - Architecture ---")
body = get_page_body("27024097297")
if body and not body.startswith("[Error"):
    print(f"  Content (first 5000 chars):\n  {body[:5000]}")
else:
    print(f"  {body}")

# 2. Disaster Recovery page (866681117)
print("\n\n--- Page: Disaster Recovery ---")
body = get_page_body("866681117")
if body and not body.startswith("[Error"):
    print(f"  Content (first 3000 chars):\n  {body[:3000]}")
else:
    print(f"  {body}")

# 3. More Secure, Stable, Cost-Effective, Developer-Friendly Infrastructure (5335644747)
print("\n\n--- Page: More Secure, Stable, Cost-Effective, Developer-Friendly Infrastructure ---")
body = get_page_body("5335644747")
if body and not body.startswith("[Error"):
    snips = extract_snippets(body, ["patch", "vulnerability", "scan", "security", "intrusion", "encrypt", "WAF", "firewall"], context=400, max_snippets=5)
    if snips:
        for i, s in enumerate(snips, 1):
            print(f"\n  Snippet {i}: ...{s[:800]}...")
    else:
        print(f"  Content (first 3000 chars):\n  {body[:3000]}")
else:
    print(f"  {body}")

# 4. Architecture Analysis (27586953254)
print("\n\n--- Page: Architecture Analysis ---")
body = get_page_body("27586953254")
if body and not body.startswith("[Error"):
    snips = extract_snippets(body, ["SAST", "DAST", "security", "test", "code review", "SDLC", "pipeline", "CI/CD", "encrypt"], context=400, max_snippets=5)
    if snips:
        for i, s in enumerate(snips, 1):
            print(f"\n  Snippet {i}: ...{s[:800]}...")
    else:
        print(f"  Content (first 3000 chars):\n  {body[:3000]}")
else:
    print(f"  {body}")

# 5. Search for TargetSolutions security or HECVAT
print("\n\n--- Search: 'TargetSolutions HECVAT' ---")
for q in ["TargetSolutions HECVAT", "TargetSolutions security questionnaire", "Vector Solutions HECVAT", "Vector Solutions security assessment"]:
    results = search_confluence(q, limit=3)
    if results:
        print(f"\n  [{q}]:")
        for r in results:
            pid = r.get("id", "")
            title = r.get("title", "")
            print(f"    - [{pid}] {title}")

# 6. Search for SOC 2 report specifically
print("\n\n--- Search: SOC report specifics ---")
for q in ["SOC 2 report Vector Solutions", "SOC report security confidentiality availability", "Vector Solutions SOC audit"]:
    results = search_confluence(q, limit=3)
    if results:
        print(f"\n  [{q}]:")
        for r in results:
            pid = r.get("id", "")
            title = r.get("title", "")
            print(f"    - [{pid}] {title}")
            if not pid.startswith("att"):
                body = get_page_body(pid)
                if body and not body.startswith("[Error"):
                    snips = extract_snippets(body, ["SOC", "trust service", "privacy", "security", "confidentiality", "availability"], context=300, max_snippets=2)
                    if snips:
                        for s in snips:
                            print(f"      ...{s[:600]}...")

# 7. EV+ Rolling Roadmap (may have accessibility roadmap)
print("\n\n--- Page: PI.27.1 EV+ Rolling Roadmap ---")
body = get_page_body("28059533346")
if body and not body.startswith("[Error"):
    snips = extract_snippets(body, ["accessibility", "VPAT", "WCAG", "remediat", "508"], context=400, max_snippets=5)
    if snips:
        for i, s in enumerate(snips, 1):
            print(f"\n  Snippet {i}: ...{s[:800]}...")
    else:
        print("  No accessibility snippets found")
else:
    print(f"  {body}")

# 8. 2026 Tech Debt Objectives - by Product (had VPAT remediation)
print("\n\n--- Page: 2026 Tech Debt Objectives - by Product ---")
body = get_page_body("27701968934")
if body and not body.startswith("[Error"):
    snips = extract_snippets(body, ["accessibility", "VPAT", "WCAG", "remediat", "508", "Target Solutions", "TargetSolutions"], context=400, max_snippets=8)
    if snips:
        for i, s in enumerate(snips, 1):
            print(f"\n  Snippet {i}: ...{s[:800]}...")
    else:
        print("  No accessibility snippets found")
else:
    print(f"  {body}")

# 9. TargetSolutions Evaluations Integration (encryption in transit)
print("\n\n--- Page: TargetSolutions Evaluations Integration ---")
body = get_page_body("639500644")
if body and not body.startswith("[Error"):
    snips = extract_snippets(body, ["encrypt", "TLS", "SSL", "HTTPS", "security", "transit"], context=400, max_snippets=3)
    if snips:
        for i, s in enumerate(snips, 1):
            print(f"\n  Snippet {i}: ...{s[:800]}...")
    else:
        print(f"  Content (first 2000 chars):\n  {body[:2000]}")
else:
    print(f"  {body}")

# 10. Onboarding for new GIST Hires (employee onboarding details)
print("\n\n--- Page: Onboarding for new GIST Hires ---")
body = get_page_body("9532277246")
if body and not body.startswith("[Error"):
    print(f"  Content (first 3000 chars):\n  {body[:3000]}")
else:
    print(f"  {body}")

# 11. Search for "Rapid7" or "CrowdStrike" or "Datadog" (intrusion monitoring tools)
print("\n\n--- Search: Intrusion/monitoring tools ---")
for q in ["Rapid7 monitoring", "CrowdStrike", "Datadog SIEM", "Graylog SIEM", "Threatstack monitoring"]:
    results = search_confluence(q, limit=3)
    if results:
        print(f"\n  [{q}]:")
        for r in results:
            pid = r.get("id", "")
            title = r.get("title", "")
            print(f"    - [{pid}] {title}")

print("\n\n" + "=" * 80)
print("TARGETED DEEP DIVE COMPLETE")
print("=" * 80)
