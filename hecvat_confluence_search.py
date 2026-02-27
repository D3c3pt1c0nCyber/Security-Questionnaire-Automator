import sys
sys.stdout.reconfigure(encoding="utf-8", errors="replace")

import urllib.request
import urllib.parse
import json
import base64
import re
import ssl

# --- Config ---
BASE = "https://lmsportal.atlassian.net/wiki/rest/api"
EMAIL = "joie.sayen@vectorsolutions.com"
TOKEN = "ATATT3xFfGF0aIpfzcrTSIMEizNJQEHxmUTEH1wOLkOVqDULSq9TJKU0BJrxjcj2okYxHXKAzQ0SbWsP6m64GFjVhIUefaC6SYNYBeATovIgYYhSZwvvjFdWojzBAXZO28kjHGuk0YgrWyI2cDY7TaWiCOn9uFbZm-NCKhcpPlLyVPcvJ0BvzLQ=A5D62EDB"
AUTH = base64.b64encode(f"{EMAIL}:{TOKEN}".encode()).decode()
HEADERS = {
    "Authorization": f"Basic {AUTH}",
    "Accept": "application/json",
}

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
    text = re.sub(r'\s+', ' ', text)
    return text.strip()

def search_and_summarize(topic, keywords_list, hecvat_id, hint_phrases):
    """Search Confluence for multiple keyword sets, read pages, extract relevant snippets."""
    print(f"\n{'='*80}")
    print(f"HECVAT {hecvat_id}: {topic}")
    print(f"{'='*80}")

    all_pages = {}  # id -> title, to deduplicate

    for keywords in keywords_list:
        cql = f'text~"{keywords}"'
        url = f"{BASE}/content/search?cql={urllib.parse.quote(cql)}&limit=5"
        print(f"  Searching: {keywords}")
        data = api_get(url)
        if data and "results" in data:
            for r in data["results"]:
                pid = r.get("id")
                title = r.get("title", "")
                if pid not in all_pages:
                    all_pages[pid] = title
                    print(f"    Found: [{pid}] {title}")
        else:
            print(f"    No results")

    if not all_pages:
        print(f"\n  ANSWER: No information found in Confluence for this topic.")
        return

    # Read top pages (limit to 4 to stay reasonable)
    collected_snippets = []
    for pid, title in list(all_pages.items())[:4]:
        url = f"{BASE}/content/{pid}?expand=body.storage"
        page = api_get(url)
        if not page:
            continue
        body_html = page.get("body", {}).get("storage", {}).get("value", "")
        body_text = strip_html(body_html)

        # Extract relevant snippets around hint phrases
        for phrase in hint_phrases:
            phrase_lower = phrase.lower()
            body_lower = body_text.lower()
            idx = body_lower.find(phrase_lower)
            while idx != -1:
                start = max(0, idx - 100)
                end = min(len(body_text), idx + len(phrase) + 300)
                snippet = body_text[start:end].strip()
                collected_snippets.append((title, snippet))
                idx = body_lower.find(phrase_lower, idx + 1)

        # If no hint phrases matched, grab a chunk from the beginning
        if not any(phrase.lower() in body_text.lower() for phrase in hint_phrases):
            if body_text:
                collected_snippets.append((title, body_text[:500]))

    # Print snippets
    if collected_snippets:
        seen = set()
        print(f"\n  RELEVANT EXCERPTS:")
        for title, snippet in collected_snippets[:8]:
            short = snippet[:400]
            if short not in seen:
                seen.add(short)
                print(f"\n  -- From \"{title}\" --")
                print(f"  {short}")
    else:
        print(f"\n  ANSWER: Pages found but no directly relevant content extracted.")


# =====================================================
# Run all searches
# =====================================================

print("HECVAT Confluence Search - SafeLMS / Vector LMS")
print("=" * 80)

# 1. Audit logs
search_and_summarize(
    topic="Audit logs - what is logged (login, logout, actions, timestamps)",
    keywords_list=["audit log", "audit trail", "login logout log", "user activity log"],
    hecvat_id="AAAI-09",
    hint_phrases=["audit", "log", "login", "logout", "timestamp", "trail", "action", "event", "record"]
)

# 2. Logging capabilities
search_and_summarize(
    topic="Logging capabilities - what system logs capture",
    keywords_list=["system log", "logging capabilities", "application log", "log monitoring", "security log"],
    hecvat_id="AAAI-10",
    hint_phrases=["log", "capture", "monitor", "syslog", "event", "alert", "SIEM", "logging"]
)

# 3. VPAT / ACR / accessibility assessment
search_and_summarize(
    topic="VPAT / ACR / accessibility assessment",
    keywords_list=["VPAT", "accessibility", "ACR", "WCAG", "Section 508", "accessibility conformance"],
    hecvat_id="ITAC-06",
    hint_phrases=["VPAT", "ACR", "WCAG", "508", "accessibility", "conformance", "assessment", "audit"]
)

# 4. Accessibility bug tracking
search_and_summarize(
    topic="Accessibility bug tracking / reporting process",
    keywords_list=["accessibility bug", "accessibility issue tracking", "accessibility remediation", "accessibility defect"],
    hecvat_id="ITAC-09",
    hint_phrases=["accessibility", "bug", "issue", "track", "report", "remediat", "defect", "backlog", "jira"]
)

# 5. Accessibility contact person / team
search_and_summarize(
    topic="Accessibility contact person / team",
    keywords_list=["accessibility contact", "accessibility team", "accessibility coordinator", "accessibility officer"],
    hecvat_id="ITAC-01 to ITAC-04",
    hint_phrases=["accessibility", "contact", "team", "coordinator", "officer", "responsible", "lead", "person"]
)

# 6. VPAT URL or accessibility statement
search_and_summarize(
    topic="VPAT URL or accessibility statement URL",
    keywords_list=["VPAT URL", "accessibility statement", "accessibility page URL", "VPAT link"],
    hecvat_id="ITAC-05",
    hint_phrases=["VPAT", "URL", "link", "accessibility statement", "http", "www", ".com", "page"]
)

# 7. Geographic data storage / data residency
search_and_summarize(
    topic="Geographic data storage / data residency",
    keywords_list=["data residency", "data center location", "geographic data", "data storage location", "AWS region"],
    hecvat_id="DCTR-03",
    hint_phrases=["data center", "location", "region", "geographic", "residency", "hosted", "AWS", "United States", "US-East", "US-West", "country"]
)

# 8. Data center physical security
search_and_summarize(
    topic="Data center physical security barriers",
    keywords_list=["physical security", "data center security", "physical access control", "facility security"],
    hecvat_id="DCTR-05, DCTR-06",
    hint_phrases=["physical", "security", "barrier", "access control", "badge", "biometric", "guard", "fence", "camera", "surveillance", "facility", "data center"]
)

print("\n\n" + "=" * 80)
print("SEARCH COMPLETE")
print("=" * 80)
