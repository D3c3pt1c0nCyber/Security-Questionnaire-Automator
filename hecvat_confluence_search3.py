import sys
sys.stdout.reconfigure(encoding="utf-8", errors="replace")

import urllib.request
import urllib.parse
import json
import base64
import re
import ssl

BASE = "https://lmsportal.atlassian.net/wiki/rest/api"
EMAIL = "joie.sayen@vectorsolutions.com"
TOKEN = "ATATT3xFfGF0aIpfzcrTSIMEizNJQEHxmUTEH1wOLkOVqDULSq9TJKU0BJrxjcj2okYxHXKAzQ0SbWsP6m64GFjVhIUefaC6SYNYBeATovIgYYhSZwvvjFdWojzBAXZO28kjHGuk0YgrWyI2cDY7TaWiCOn9uFbZm-NCKhcpPlLyVPcvJ0BvzLQ=A5D62EDB"
AUTH = base64.b64encode(f"{EMAIL}:{TOKEN}".encode()).decode()
HEADERS = {"Authorization": f"Basic {AUTH}", "Accept": "application/json"}
ctx = ssl.create_default_context()

def api_get(url):
    req = urllib.request.Request(url, headers=HEADERS)
    try:
        with urllib.request.urlopen(req, context=ctx, timeout=30) as resp:
            return json.loads(resp.read().decode("utf-8", errors="replace"))
    except Exception as e:
        print(f"  [ERROR] {e}")
        return None

def strip_html(html):
    text = re.sub(r'<[^>]+>', ' ', html)
    for ent, rep in [('&nbsp;',' '),('&amp;','&'),('&lt;','<'),('&gt;','>'),('&rsquo;',"'"),('&ldquo;','"'),('&rdquo;','"'),('&quot;','"')]:
        text = text.replace(ent, rep)
    text = re.sub(r'&#\d+;', ' ', text)
    text = re.sub(r'&\w+;', ' ', text)
    text = re.sub(r'\s+', ' ', text)
    return text.strip()

def search_cql(cql, limit=5):
    url = f"{BASE}/content/search?cql={urllib.parse.quote(cql)}&limit={limit}"
    data = api_get(url)
    results = []
    if data and "results" in data:
        for r in data["results"]:
            pid = r.get("id", "")
            title = r.get("title", "")
            if not pid.startswith("att"):
                results.append((pid, title))
                print(f"  [{pid}] {title}")
    return results

def read_page(pid, label=""):
    url = f"{BASE}/content/{pid}?expand=body.storage"
    page = api_get(url)
    if not page:
        return ""
    title = page.get("title", "")
    body_html = page.get("body", {}).get("storage", {}).get("value", "")
    body_text = strip_html(body_html)
    print(f"\n--- Page [{pid}]: {title} ---")
    print(body_text[:3000])
    return body_text

# Read the Software Security Compliance 101 page in full - it had great info
print("="*80)
print("FULL READ: Software Security Compliance 101")
print("="*80)
text = read_page("26110559022")
print("\n\n... FULL PAGE (continued) ...")
print(text[:6000])

# Read "Public-Facing Security Documents"  
print("\n\n" + "="*80)
print("SEARCH: Public-Facing Security Documents")
print("="*80)
results = search_cql('title="Public-Facing Security Documents"', 3)
for pid, title in results[:2]:
    read_page(pid)

# Search for SafeLMS audit
print("\n\n" + "="*80)
print("SEARCH: SafeLMS audit trail")
print("="*80)
results = search_cql('text~"SafeLMS audit"', 5)
for pid, title in results[:3]:
    read_page(pid)

# Search for TargetSolutions audit log
print("\n\n" + "="*80)
print("SEARCH: TargetSolutions audit log")
print("="*80)
results = search_cql('text~"TargetSolutions audit"', 5)
for pid, title in results[:2]:
    read_page(pid)

# Search for "activity log" in SafeLMS or Vector LMS
print("\n\n" + "="*80)
print("SEARCH: activity log SafeLMS")
print("="*80)
results = search_cql('text~"activity log" AND text~"SafeLMS"', 5)
for pid, title in results[:2]:
    read_page(pid)

# Search for AWS data center US
print("\n\n" + "="*80)
print("SEARCH: AWS US-East OR us-east")
print("="*80)
results = search_cql('text~"us-east"', 5)
for pid, title in results[:3]:
    read_page(pid)

# Search for infrastructure hosting AWS
print("\n\n" + "="*80)
print("SEARCH: infrastructure AWS cloud hosting")
print("="*80)
results = search_cql('text~"AWS cloud" AND text~"hosting"', 5)
for pid, title in results[:2]:
    read_page(pid)

# Search for WCAG accessibility work
print("\n\n" + "="*80)
print("SEARCH: WCAG remediation accessibility")
print("="*80)
results = search_cql('text~"WCAG" AND text~"remediation"', 5)
for pid, title in results[:2]:
    read_page(pid)

# Search for accessibility statement or policy
print("\n\n" + "="*80)
print("SEARCH: accessibility policy statement vectorsolutions")
print("="*80)
results = search_cql('text~"accessibility" AND text~"vectorsolutions.com"', 5)
for pid, title in results[:2]:
    read_page(pid)

# Security Form page
print("\n\n" + "="*80)
print("READ: Security Form page")
print("="*80)
read_page("904855579")

# Search for physical security AWS SOC
print("\n\n" + "="*80)
print("SEARCH: AWS SOC physical security")
print("="*80)
results = search_cql('text~"AWS" AND text~"physical security"', 5)
for pid, title in results[:2]:
    read_page(pid)

# Accomack County Third Party System Assessment
print("\n\n" + "="*80)
print("READ: Third Party System Assessment")
print("="*80)
# That was an attachment, let's search for it as a page
results = search_cql('title~"Security" AND title~"Assessment"', 5)
for pid, title in results[:3]:
    read_page(pid)

print("\n\nDONE")
