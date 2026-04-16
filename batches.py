import os
import json
import csv
import requests
from datetime import datetime, timezone

# ================= CONFIG =================
IMS_URL = "https://ims-na1.adobelogin.com/ims/token/v3"
HOSTS = [
    "https://platform-nld2.adobe.io",
    "https://platform.adobe.io"
]

CLIENT_ID     = os.getenv("AEP_CLIENT_ID", "f654aee0bdeb4e30a8f73bd15be05d7e")
CLIENT_SECRET = os.getenv("AEP_CLIENT_SECRET", "p8e-5-w0Dy15XgoKR3zHXnpzJwqmlZ0AXoPo")
ORG_ID        = os.getenv("AEP_ORG_ID", "B5721F9167DAC54A0A495FB4@AdobeOrg")
SANDBOX       = os.getenv("AEP_SANDBOX", "prod")
SCOPE         = "openid,AdobeID,read_organizations,additional_info.projectedProductContext,session"

DATASET_ID = "698440b5585d8ff073d5d813"

# ================= AUTH =================
def get_token():
    r = requests.post(
        IMS_URL,
        headers={"Content-Type": "application/x-www-form-urlencoded"},
        data={
            "grant_type": "client_credentials",
            "client_id": CLIENT_ID,
            "client_secret": CLIENT_SECRET,
            "scope": SCOPE,
        },
        timeout=30
    )
    r.raise_for_status()
    return r.json()["access_token"]

def std_headers(token):
    return {
        "Authorization": f"Bearer {token}",
        "x-api-key": CLIENT_ID,
        "x-gw-ims-org-id": ORG_ID,
        "x-sandbox-name": SANDBOX,
        "Accept": "application/json",
        "Content-Type": "application/json"
    }

# ================= FETCH ALL BATCHES =================
def get_all_batches(token):
    url = f"{HOSTS[1]}/data/foundation/catalog/batches"
    params = {
        "dataSet": DATASET_ID,
        "limit": 100
    }

    all_batches = []

    while url:
        r = requests.get(url, headers=std_headers(token), params=params)
        r.raise_for_status()
        data = r.json()

        for bid, info in data.items():
            if bid == "_page":
                continue

            status = info.get("status", "unknown")
            created_dt = datetime.fromtimestamp(
                info["created"] / 1000,
                tz=timezone.utc
            )

            # Status emoji
            status_emoji = {
                "success": "✅",
                "failed": "❌",
                "active": "🔵",
                "staging": "⏳",
                "loading": "📥",
                "retrying": "🔄"
            }.get(status.lower(), "❓")

            print(f"{status_emoji} Batch: {bid} | Status: {status} | Created: {created_dt.isoformat()}")

            all_batches.append({
                "batch_id": bid,
                "status": status,
                "created_dt": created_dt
            })

        next_page = data.get("_page", {}).get("next")
        if next_page:
            url = f"{HOSTS[1]}{next_page}"
            params = None
        else:
            url = None

    return all_batches

# ================= FAILOVER HELPERS =================
def get_json_with_failover(path, token, params=None):
    for base in HOSTS:
        r = requests.get(
            f"{base}{path}",
            headers=std_headers(token),
            params=params,
            timeout=90
        )
        if r.status_code == 404:
            continue
        r.raise_for_status()
        return r.json(), base
    raise RuntimeError(f"404 on {path}")

def get_text_with_failover(path, token, params=None, base_hint=None):
    hosts = [base_hint] + [h for h in HOSTS if h != base_hint] if base_hint else HOSTS
    for base in hosts:
        r = requests.get(
            f"{base}{path}",
            headers=std_headers(token),
            params=params,
            timeout=180
        )
        if r.status_code == 404:
            continue
        r.raise_for_status()
        return r.text
    raise RuntimeError(f"404 on {path}")

# ================= FAILED RECORD HELPERS =================
def list_failed_index(token, batch_id):
    return get_json_with_failover(
        f"/data/foundation/export/batches/{batch_id}/failed",
        token
    )

def download_failed_item(token, batch_id, host, name):
    return get_text_with_failover(
        f"/data/foundation/export/batches/{batch_id}/failed",
        token,
        params={"path": name},
        base_hint=host
    )

def extract_xdm_entity(rec):
    body = rec.get("body")
    if isinstance(body, dict) and isinstance(body.get("xdmEntity"), dict):
        return body["xdmEntity"]
    if isinstance(rec.get("xdmEntity"), dict):
        return rec["xdmEntity"]
    return None

def extract_streaming_errors(rec):
    errs = []
    _errors = rec.get("_errors", {})
    for k in ("_streamingValidation", "_validation"):
        arr = _errors.get(k)
        if isinstance(arr, list):
            for e in arr:
                errs.append({
                    "path": e.get("path"),
                    "message": e.get("message"),
                    "code": e.get("code")
                })
    return errs

# ================= PROCESS FAILED BATCH =================
def process_failed_batch(token, batch_id, batch_created_dt):
    rows = []

    failed_index, host = list_failed_index(token, batch_id)
    items = failed_index.get("data", [])

    for item in items:
        name = item.get("name")
        if not name:
            continue

        ndjson = download_failed_item(token, batch_id, host, name)

        for line in ndjson.splitlines():
            try:
                rec = json.loads(line)
            except Exception:
                continue

            xdm = extract_xdm_entity(rec)
            if not isinstance(xdm, dict):
                continue

            for err in extract_streaming_errors(rec):
                rows.append({
                    "BatchID": batch_id,
                    "BatchCreatedUTC": batch_created_dt.isoformat(),
                    "ErrorPath": err.get("path"),
                    "ErrorMessage": err.get("message") or err.get("code"),
                    "Object": json.dumps(xdm, ensure_ascii=False)
                })

    return rows

# ================= SUCCESS BATCH HELPERS =================
def list_batch_files(token, batch_id):
    return get_json_with_failover(
        f"/data/foundation/export/batches/{batch_id}/files",
        token
    )

def download_batch_file(token, batch_id, host, file_path):
    return get_text_with_failover(
        f"/data/foundation/export/batches/{batch_id}/files",
        token,
        params={"path": file_path},
        base_hint=host
    )

# ================= PROCESS SUCCESS BATCH =================
def process_success_batch(token, batch_id, batch_created_dt):
    rows = []

    try:
        files_index, host = list_batch_files(token, batch_id)

        # Print raw response
        print(f"\n   📦 Raw batch files response:")
        print(json.dumps(files_index, indent=2, default=str))

        items = files_index.get("data", [])

        if not items:
            print(f"   ⚠️ No files found in batch {batch_id}")
            return rows

        for item in items:
            name = item.get("name", "")

            # Get href from _links.self.href
            href = item.get("_links", {}).get("self", {}).get("href", "")

            print(f"\n   📄 File: {name}")
            print(f"   🔗 href: {href}")

            if href:
                try:
                    # Fetch data using href
                    print(f"   ⬇️ Fetching from href...")
                    r = requests.get(
                        href,
                        headers=std_headers(token),
                        timeout=180
                    )
                    r.raise_for_status()
                    content = r.text

                    # Print raw file content (first 2000 chars)
                    print(f"\n   📄 Raw href response (first 2000 chars):")
                    print(content[:2000])
                    print(f"\n   ... (total length: {len(content)} chars)")

                    # Handle NDJSON (newline-delimited JSON) or JSON array
                    if content.strip().startswith('['):
                        # JSON array
                        records = json.loads(content)
                    elif content.strip().startswith('{'):
                        # Could be single object or nested data
                        parsed = json.loads(content)
                        if "data" in parsed and isinstance(parsed["data"], list):
                            records = parsed["data"]
                        else:
                            records = [parsed]
                    else:
                        # NDJSON
                        records = []
                        for line in content.splitlines():
                            line = line.strip()
                            if line:
                                try:
                                    records.append(json.loads(line))
                                except:
                                    pass

                    for rec in records:
                        xdm = extract_xdm_entity(rec) or rec
                        rows.append({
                            "BatchID": batch_id,
                            "BatchCreatedUTC": batch_created_dt.isoformat(),
                            "FileName": name,
                            "Data": json.dumps(xdm, ensure_ascii=False)
                        })

                except Exception as e:
                    print(f"   ❌ Error fetching href: {e}")
            else:
                print(f"   ⚠️ No href found for file")

    except Exception as e:
        print(f"   ❌ Error listing files for batch {batch_id}: {e}")

    return rows

# ================= MAIN =================
if __name__ == "__main__":
    token = get_token()

    print(f"\n📅 Fetching all batches for dataset: {DATASET_ID}\n")

    all_batches = get_all_batches(token)

    # Print summary by status
    status_counts = {}
    for b in all_batches:
        status = b["status"]
        status_counts[status] = status_counts.get(status, 0) + 1

    print(f"\n📊 Batch Summary:")
    for status, count in sorted(status_counts.items()):
        print(f"   {status}: {count}")
    print(f"   Total: {len(all_batches)}")

    # Get first success batch
    success_batches = [b for b in all_batches if b["status"].lower() == "success"]

    if not success_batches:
        print("\n⚠️ No success batches found")
        exit(0)

    # Take first batch
    first_batch = success_batches[0]
    batch_id = first_batch["batch_id"]

    print(f"\n{'='*50}")
    print(f"🔍 FETCHING FIRST BATCH: {batch_id}")
    print(f"{'='*50}")

    # Get batch files
    files_index, host = list_batch_files(token, batch_id)

    print(f"\n📦 Batch files response:")
    print(json.dumps(files_index, indent=2, default=str))

    items = files_index.get("data", [])

    if not items:
        print("\n⚠️ No files in batch")
        exit(0)

    # Get first file's href
    first_file = items[0]
    href = first_file.get("_links", {}).get("self", {}).get("href", "")

    print(f"\n{'='*50}")
    print(f"🔗 FIRST FILE HREF: {href}")
    print(f"{'='*50}")

    if href:
        # Fetch from href
        r = requests.get(
            href,
            headers=std_headers(token),
            timeout=180
        )
        r.raise_for_status()

        print(f"\n📄 FULL HREF RESPONSE:")
        print(f"{'='*50}")

        # Try to parse as JSON and pretty print
        try:
            json_response = r.json()
            print(json.dumps(json_response, indent=2, default=str))

            # Look for nested href (parquet file)
            nested_items = json_response.get("data", [])
            if nested_items and len(nested_items) > 0:
                first_nested = nested_items[0]
                parquet_href = first_nested.get("_links", {}).get("self", {}).get("href", "")

                if parquet_href:
                    print(f"\n{'='*50}")
                    print(f"🔗 PARQUET FILE HREF: {parquet_href}")
                    print(f"{'='*50}")

                    # Fetch parquet file
                    r2 = requests.get(
                        parquet_href,
                        headers=std_headers(token),
                        timeout=180
                    )
                    r2.raise_for_status()

                    print(f"\n📄 PARQUET HREF RESPONSE:")
                    print(f"{'='*50}")

                    # Check if it's binary (parquet) or text
                    content_type = r2.headers.get("Content-Type", "")
                    print(f"Content-Type: {content_type}")
                    print(f"Content-Length: {len(r2.content)} bytes")

                    # Try to parse as JSON first
                    try:
                        parquet_json = r2.json()
                        print(json.dumps(parquet_json, indent=2, default=str))
                    except:
                        # It's binary data (actual parquet file)
                        print(f"\n📦 Binary data (first 500 bytes as hex):")
                        print(r2.content[:500].hex())
                        print(f"\n📦 Binary data (first 500 bytes raw):")
                        print(r2.content[:500])
                else:
                    print("\n⚠️ No parquet href found in nested data")
            else:
                print("\n⚠️ No nested data items found")

        except:
            # If not JSON, print raw text
            print(r.text)
    else:
        print("\n⚠️ No href found in first file")
