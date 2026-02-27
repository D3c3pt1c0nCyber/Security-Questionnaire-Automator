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
print("FINAL TARGETED PAGES")
print("=" * 80)

# 1. Rapid7 InsightIDR Implementation in IndustrySafe
print("\n--- Page: Rapid7 InsightIDR Implementation in IndustrySafe ---")
body = get_page_body("6407651379")
if body and not body.startswith("[Error"):
    print(f"  Content (first 3000 chars):\n  {body[:3000]}")
else:
    print(f"  {body}")

# 2. Software Security Compliance 101
print("\n\n--- Page: Software Security Compliance 101 ---")
body = get_page_body("26110559022")
if body and not body.startswith("[Error"):
    print(f"  Content (first 5000 chars):\n  {body[:5000]}")
else:
    print(f"  {body}")

# 3. Deployment Documentation (had RPO/RTO info)
print("\n\n--- Page: Deployment Documentation ---")
body = get_page_body("27731820696")
if body and not body.startswith("[Error"):
    snips = extract_snippets(body, ["RPO", "RTO", "backup", "recovery", "retention", "disaster", "encrypt", "TLS", "AES"], context=400, max_snippets=5)
    if snips:
        for i, s in enumerate(snips, 1):
            print(f"\n  Snippet {i}: ...{s[:800]}...")
    else:
        print(f"  Content (first 2000 chars):\n  {body[:2000]}")
else:
    print(f"  {body}")

# 4. SafeLMS Offline Learning Capability (appeared in AES-256 results)
print("\n\n--- Page: Duplicate of PRD: SafeLMS Offline Learning Capability ---")
body = get_page_body("27942683422")
if body and not body.startswith("[Error"):
    snips = extract_snippets(body, ["AES", "encrypt", "TLS", "256", "security"], context=400, max_snippets=3)
    if snips:
        for i, s in enumerate(snips, 1):
            print(f"\n  Snippet {i}: ...{s[:800]}...")
    else:
        print("  No encryption snippets found")
else:
    print(f"  {body}")

# 5. Continuous Monitoring Feb 2026 - fetch more sections
print("\n\n--- Continuous Monitoring Feb 2026 - Additional keywords ---")
body = get_page_body("28279701514")
if body and not body.startswith("[Error"):
    for kw in ["Rapid7", "Datadog", "Graylog", "SIEM", "IDS", "IPS", "intrusion", "Threatstack",
               "Nessus", "Veracode", "Burp", "penetration", "SAST", "DAST",
               "backup", "retention", "disaster recovery", "RPO", "RTO",
               "SOC 2", "SOC2", "FedRAMP",
               "change management", "change control"]:
        snips = extract_snippets(body, [kw], context=400, max_snippets=1)
        if snips:
            print(f"\n  [{kw}]:")
            for s in snips:
                print(f"    ...{s[:600]}...")
else:
    print(f"  {body}")

print("\n\n" + "=" * 80)
print("FINAL SEARCH COMPLETE")
print("=" * 80)
