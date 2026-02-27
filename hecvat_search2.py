import sys
sys.stdout.reconfigure(encoding="utf-8", errors="replace")

import urllib.request
import urllib.parse
import json
import base64
import re
import ssl

BASE_URL = "https://lmsportal.atlassian.net/wiki/rest/api"
EMAIL = "joie.sayen@vectorsolutions.com"
TOKEN = "ATATT3xFfGF0aIpfzcrTSIMEizNJQEHxmUTEH1wOLkOVqDULSq9TJKU0BJrxjcj2okYxHXKAzQ0SbWsP6m64GFjVhIUefaC6SYNYBeATovIgYYhSZwvvjFdWojzBAXZO28kjHGuk0YgrWyI2cDY7TaWiCOn9uFbZm-NCKhcpPlLyVPcvJ0BvzLQ=A5D62EDB"
AUTH = base64.b64encode(f"{EMAIL}:{TOKEN}".encode()).decode()
ssl_ctx = ssl.create_default_context()

def api_get(url):
    req = urllib.request.Request(url)
    req.add_header("Authorization", f"Basic {AUTH}")
    req.add_header("Accept", "application/json")
    with urllib.request.urlopen(req, context=ssl_ctx, timeout=30) as resp:
        return json.loads(resp.read().decode("utf-8"))

def strip_html(html):
    text = re.sub(r'<[^>]+>', ' ', html)
    text = re.sub(r'&nbsp;', ' ', text)
    text = re.sub(r'&amp;', '&', text)
    text = re.sub(r'&lt;', '<', text)
    text = re.sub(r'&gt;', '>', text)
    text = re.sub(r'&#\d+;', ' ', text)
    text = re.sub(r'&[a-z]+;', ' ', text)
    text = re.sub(r'\s+', ' ', text)
    return text.strip()

def search_confluence(query, limit=5):
    cql = f'type=page AND text~"{query}"'
    url = f'{BASE_URL}/content/search?cql={urllib.parse.quote(cql)}&limit={limit}'
    try:
        data = api_get(url)
        return data.get("results", [])
    except Exception as e:
        print(f"  [Search error for '{query}']: {e}")
        return []

def get_page_body(page_id):
    url = f'{BASE_URL}/content/{page_id}?expand=body.storage'
    try:
        data = api_get(url)
        html = data.get("body", {}).get("storage", {}).get("value", "")
        return strip_html(html)
    except Exception as e:
        print(f"  [Page fetch error {page_id}]: {e}")
        return ""

def find_relevant_excerpts(body, search_terms, window=600):
    """Find multiple relevant excerpts around search terms."""
    body_lower = body.lower()
    excerpts = []
    seen_positions = set()
    
    for term in search_terms:
        for word in term.lower().split():
            if len(word) < 4:
                continue
            start = 0
            while True:
                pos = body_lower.find(word, start)
                if pos == -1:
                    break
                # Check if we already have an excerpt near this position
                too_close = any(abs(pos - sp) < window for sp in seen_positions)
                if not too_close:
                    seen_positions.add(pos)
                    begin = max(0, pos - 200)
                    end = min(len(body), pos + window)
                    excerpt = body[begin:end]
                    if begin > 0:
                        excerpt = "..." + excerpt
                    if end < len(body):
                        excerpt = excerpt + "..."
                    excerpts.append(excerpt)
                start = pos + 1
                if len(excerpts) >= 3:
                    break
            if len(excerpts) >= 3:
                break
    
    return excerpts

def search_topic(hecvat_id, topic, keyword_sets):
    print(f"\n{'='*80}")
    print(f"HECVAT {hecvat_id} -- {topic}")
    print(f"{'='*80}")
    
    seen_ids = set()
    all_pages = []
    
    for kw in keyword_sets:
        results = search_confluence(kw, limit=5)
        for r in results:
            pid = r.get("id")
            if pid and pid not in seen_ids:
                seen_ids.add(pid)
                all_pages.append(r)
    
    if not all_pages:
        print("  >> No page results found.\n")
        return
    
    print(f"  Found {len(all_pages)} unique pages.\n")
    
    for page in all_pages[:6]:
        pid = page.get("id")
        title = page.get("title", "(no title)")
        body = get_page_body(pid)
        if not body or len(body) < 50:
            continue
        
        print(f"  --- Page: \"{title}\" (id={pid}) ---")
        
        all_terms = []
        for kw in keyword_sets:
            all_terms.extend(kw.split())
        
        excerpts = find_relevant_excerpts(body, keyword_sets, window=500)
        if excerpts:
            for i, exc in enumerate(excerpts):
                print(f"    Excerpt {i+1}: {exc}\n")
        else:
            # Just show first 800 chars
            print(f"    {body[:800]}...\n")


# ---- Refined searches ----

print("=" * 80)
print("HECVAT Confluence Search (Refined) - SafeLMS / Vector LMS")
print("=" * 80)

# 1. APPL-06: SAST / Code scanning
search_topic("APPL-06", "Static code analysis / SAST tools",
    ["Checkmarx", "code security scan", "static analysis", "Veracode", "SonarQube", "code scan findings"])

# 2. APPL-10: Software supply chain
search_topic("APPL-10", "Software supply chain management",
    ["software composition analysis", "dependency scanning", "third party library", "open source vulnerability", "software supply chain", "SBOM bill of materials"])

# 3. DCTR-14: MFA for admin
search_topic("DCTR-14", "MFA for administrative accounts",
    ["multi-factor authentication", "MFA admin", "two-factor authentication", "Okta MFA", "Azure MFA", "admin access security"])

# 4. DATA-16: Data sanitization
search_topic("DATA-16", "Data sanitization / media destruction standards",
    ["data sanitization", "media destruction", "secure wipe", "disk disposal", "data purge", "decommission server"])

# 5. DOCU-07: Onboarding/offboarding
search_topic("DOCU-07", "Employee onboarding/offboarding process",
    ["employee onboarding process", "offboarding process", "access provisioning", "termination checklist", "new hire access", "employee lifecycle"])

# 6. THRD-05: Hardware supply chain
search_topic("THRD-05", "Hardware supply chain management",
    ["hardware procurement", "supply chain risk", "hardware vendor management", "hardware lifecycle", "AWS infrastructure", "cloud provider hardware"])

# 7. DATA-05/07: Backup and retention
search_topic("DATA-05, DATA-07", "Backup retention and data zone policies",
    ["backup retention policy", "backup schedule", "data retention policy", "disaster recovery", "backup recovery", "RPO RTO"])

# 8. DATA-06/08: Data ownership at contract end
search_topic("DATA-06, DATA-08", "Data ownership rights at contract end",
    ["data ownership", "contract termination data", "data return policy", "data portability", "customer data deletion", "data export contract"])

print("\n" + "=" * 80)
print("SEARCH COMPLETE")
print("=" * 80)
