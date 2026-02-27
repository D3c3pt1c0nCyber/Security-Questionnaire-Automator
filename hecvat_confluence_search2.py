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
    text = re.sub(r'&nbsp;', ' ', text)
    text = re.sub(r'&amp;', '&', text)
    text = re.sub(r'&lt;', '<', text)
    text = re.sub(r'&gt;', '>', text)
    text = re.sub(r'&#\d+;', ' ', text)
    text = re.sub(r'&\w+;', ' ', text)
    text = re.sub(r'\s+', ' ', text)
    return text.strip()

def read_page(pid, label=""):
    url = f"{BASE}/content/{pid}?expand=body.storage"
    page = api_get(url)
    if not page:
        return ""
    title = page.get("title", "")
    body_html = page.get("body", {}).get("storage", {}).get("value", "")
    body_text = strip_html(body_html)
    print(f"\n--- Page [{pid}]: {title} ---")
    # Print first 2000 chars
    print(body_text[:2000])
    return body_text

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

# =====================================================
# DEEP DIVES
# =====================================================

# 1. Read the key Accessibility pages directly
print("="*80)
print("ACCESSIBILITY PAGES (ITAC-01 through ITAC-09)")
print("="*80)

# These were found in the first search
for pid in ["27329331264", "27239284941", "26433486923"]:
    read_page(pid)

print("\n\n" + "="*80)
print("VPAT / WCAG PAGES")
print("="*80)

for pid in ["9682190023", "6431081053", "28153937955"]:
    read_page(pid)

# Search for VPAT ACR pdf attachments - let's look at the page that has VPAT-ACR attachments
print("\n\n" + "="*80)
print("SEARCH: VPAT ACR report")
print("="*80)
results = search_cql('text~"VPAT ACR"', 5)
# Also look at the LiveSafe VPAT pages
results2 = search_cql('text~"VPAT report"', 5)

print("\n\n" + "="*80)
print("SEARCH: AWS hosting region data center")
print("="*80)
results = search_cql('text~"AWS hosting"', 5)
for pid, title in results[:3]:
    read_page(pid)

print("\n\n" + "="*80)
print("SEARCH: hosted United States")
print("="*80)
results = search_cql('text~"hosted United States"', 5)
for pid, title in results[:2]:
    read_page(pid)

print("\n\n" + "="*80)
print("SEARCH: SOC 2 data center")
print("="*80)
results = search_cql('text~"SOC 2"', 5)
for pid, title in results[:2]:
    read_page(pid)

print("\n\n" + "="*80)
print("SEARCH: security architecture infrastructure")
print("="*80)
results = search_cql('text~"security architecture"', 5)
for pid, title in results[:2]:
    read_page(pid)

print("\n\n" + "="*80)
print("SEARCH: audit log login event tracking")
print("="*80)
results = search_cql('text~"event tracking login"', 5)
for pid, title in results[:2]:
    read_page(pid)

# Search for HECVAT or security questionnaire
print("\n\n" + "="*80)
print("SEARCH: HECVAT")
print("="*80)
results = search_cql('text~"HECVAT"', 5)
for pid, title in results[:3]:
    read_page(pid)

# Search for security questionnaire
print("\n\n" + "="*80)
print("SEARCH: security questionnaire")
print("="*80)
results = search_cql('text~"security questionnaire"', 5)
for pid, title in results[:2]:
    read_page(pid)

print("\n\nDONE")
