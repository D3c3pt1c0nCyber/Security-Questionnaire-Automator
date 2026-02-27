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
    for ent, ch in [('&nbsp;',' '),('&amp;','&'),('&lt;','<'),('&gt;','>'),
                     ('&ldquo;','"'),('&rdquo;','"'),('&lsquo;',"'"),('&rsquo;',"'"),
                     ('&bull;','*'),('&hellip;','...'),('&ndash;','-'),('&mdash;','-')]:
        text = text.replace(ent, ch)
    text = re.sub(r'&#\d+;', ' ', text)
    text = re.sub(r'&[a-z]+;', ' ', text)
    text = re.sub(r'\s+', ' ', text)
    return text.strip()

def search_pages(query, limit=10):
    cql = f'type=page AND text~"{query}"'
    url = f'{BASE_URL}/content/search?cql={urllib.parse.quote(cql)}&limit={limit}'
    try:
        data = api_get(url)
        return data.get("results", [])
    except Exception as e:
        print(f"  [Search error]: {e}")
        return []

def get_page_body(page_id):
    url = f'{BASE_URL}/content/{page_id}?expand=body.storage'
    try:
        data = api_get(url)
        html = data.get("body", {}).get("storage", {}).get("value", "")
        return strip_html(html)
    except Exception as e:
        return ""

def find_snippets(body, terms, window=400, max_snippets=3):
    body_lower = body.lower()
    snippets = []
    used_pos = []
    for term in terms:
        words = [w for w in term.lower().split() if len(w) >= 4]
        for word in words:
            idx = 0
            while idx < len(body_lower):
                pos = body_lower.find(word, idx)
                if pos == -1:
                    break
                if not any(abs(pos - p) < window for p in used_pos):
                    used_pos.append(pos)
                    start = max(0, pos - 150)
                    end = min(len(body), pos + window)
                    s = body[start:end]
                    if start > 0: s = "..." + s
                    if end < len(body): s = s + "..."
                    snippets.append(s)
                idx = pos + len(word)
                if len(snippets) >= max_snippets:
                    break
            if len(snippets) >= max_snippets:
                break
        if len(snippets) >= max_snippets:
            break
    return snippets

def do_search(hecvat_id, topic, keyword_sets, extra_page_ids=None):
    """Search and collect relevant content, print concisely."""
    print(f"\n{'='*80}")
    print(f"  HECVAT {hecvat_id}: {topic}")
    print(f"{'='*80}")
    
    seen = set()
    pages = []
    
    # Add any pre-identified pages
    if extra_page_ids:
        for pid in extra_page_ids:
            seen.add(str(pid))
            pages.append({"id": str(pid), "title": f"(direct id={pid})"})
    
    for kw in keyword_sets:
        for r in search_pages(kw, limit=5):
            pid = r.get("id")
            if pid and pid not in seen:
                seen.add(pid)
                pages.append(r)
    
    found_anything = False
    for page in pages[:8]:
        pid = page["id"]
        title = page.get("title", "")
        body = get_page_body(pid)
        if not body or len(body) < 80:
            continue
        
        snippets = find_snippets(body, keyword_sets)
        if not snippets and not extra_page_ids:
            continue
        
        found_anything = True
        print(f"\n  Page: \"{title}\" (id={pid})")
        if snippets:
            for i, s in enumerate(snippets, 1):
                print(f"    [{i}] {s}")
        else:
            print(f"    {body[:600]}...")
        print()
    
    if not found_anything:
        print("  >> No directly relevant content found in Confluence pages.\n")


# ===== Run all HECVAT searches =====

print("="*80)
print(" HECVAT CONFLUENCE SEARCH RESULTS - Vector Solutions / SafeLMS")
print("="*80)

# 1. APPL-06: SAST tools
do_search("APPL-06", "Static code analysis / SAST tools used",
    ["Checkmarx", "code security scan", "SAST static analysis", "Veracode SonarQube", "application security scanning"],
    extra_page_ids=["6515393709"])

# 2. APPL-10: Software supply chain
do_search("APPL-10", "Software supply chain management (SBOM, dependency scanning)",
    ["software composition analysis", "dependency vulnerability", "third party library security",
     "open source scanning", "software bill of materials", "Snyk", "Dependabot", "npm audit"])

# 3. DCTR-14: MFA for admin accounts
do_search("DCTR-14", "MFA for administrative accounts",
    ["MFA administrative", "multi-factor authentication", "Okta", "two-factor admin",
     "SSO single sign-on", "privileged access", "admin authentication"])

# 4. DATA-16: Data sanitization / media destruction
do_search("DATA-16", "Data sanitization / media destruction (DoD 5220.22-M, NIST 800-88)",
    ["data sanitization", "media destruction", "disk wiping", "decommission",
     "data disposal", "secure erase", "equipment disposal", "AWS data deletion"])

# 5. DOCU-07: Employee onboarding/offboarding
do_search("DOCU-07", "Employee onboarding/offboarding processes",
    ["employee offboarding", "access revocation", "termination process",
     "onboarding checklist security", "new hire access provisioning", "employee departure"])

# 6. THRD-05: Hardware supply chain
do_search("THRD-05", "Hardware supply chain management",
    ["hardware supply chain", "hardware procurement", "server procurement",
     "cloud infrastructure provider", "AWS hardware", "physical infrastructure"])

# 7. DATA-05/07: Backup retention / data zones
do_search("DATA-05/DATA-07", "Backup retention and data zone policies",
    ["backup retention", "backup policy", "disaster recovery plan",
     "data retention period", "RPO RTO backup", "backup schedule"],
    extra_page_ids=["875200767"])

# 8. DATA-06/08: Data ownership at contract end
do_search("DATA-06/DATA-08", "Data ownership rights at contract end",
    ["data ownership contract", "customer data return", "data portability",
     "contract termination data", "data deletion request", "end of contract"],
    extra_page_ids=["9571370036"])

print("\n" + "="*80)
print(" DONE")
print("="*80)
