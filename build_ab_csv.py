#!/usr/bin/env python3
"""
Build ab_test_assignments_full.csv by:
1. Parsing the JSON source file to extract markdown tables for 4 regions
2. Loading assignments CSV (Region, Account Name, AB Test)
3. Matching by Account Name (case-insensitive, stripped)
4. Overwriting AB test column with assignment value
5. Writing a clean combined CSV
"""

import json
import csv
import re
import io
import sys

SOURCE_FILE = "/root/.claude/projects/-home-user-DSR/273a7926-3fb1-48d2-8edd-83f697fe6862/tool-results/mcp-524a2989-6e89-4987-9cc4-c5ed852a61fb-read_file_content-1779960046937.txt"
ASSIGNMENTS_FILE = "/home/user/DSR/ab_test_assignments.csv"
OUTPUT_FILE = "/home/user/DSR/ab_test_assignments_full.csv"


def load_source_content():
    with open(SOURCE_FILE, "r", encoding="utf-8") as f:
        raw = f.read()
    # The file is JSON with a fileContent key
    data = json.loads(raw)
    return data["fileContent"]


def unescape_html(text):
    """Decode HTML entities like &#10; (newline)"""
    text = text.replace("&#10;", "\n")
    text = text.replace("&amp;", "&")
    text = text.replace("&lt;", "<")
    text = text.replace("&gt;", ">")
    text = text.replace("&quot;", '"')
    return text


def parse_markdown_table(lines):
    """
    Parse a list of markdown table lines into list of dicts.
    Skips the separator row (| :-: | ...).
    Returns (headers, rows).
    """
    headers = None
    rows = []
    for line in lines:
        line = line.strip()
        if not line.startswith("|"):
            continue
        # Skip separator rows
        if re.match(r"^\|[\s:\-\|]+\|$", line):
            continue
        # Split by |, strip whitespace
        parts = [c.strip() for c in line.split("|")]
        # Remove empty first/last from leading/trailing |
        if parts and parts[0] == "":
            parts = parts[1:]
        if parts and parts[-1] == "":
            parts = parts[:-1]

        if headers is None:
            # Unescape header names and normalize
            headers = [unescape_html(h) for h in parts]
        else:
            if len(parts) < len(headers):
                parts += [""] * (len(headers) - len(parts))
            elif len(parts) > len(headers):
                parts = parts[:len(headers)]
            row = {headers[i]: unescape_html(parts[i]) for i in range(len(headers))}
            rows.append(row)
    return headers, rows


def extract_tables_from_content(content):
    """
    Split content into individual markdown tables and parse them.
    Returns list of (table_text, headers, rows).
    """
    # Split content by double newlines to find table blocks
    # A table block starts with | ... | header row
    lines = content.split("\n")

    tables = []
    current_table_lines = []
    in_table = False

    for line in lines:
        stripped = line.strip()
        if stripped.startswith("|"):
            in_table = True
            current_table_lines.append(line)
        else:
            if in_table and current_table_lines:
                # End of table
                headers, rows = parse_markdown_table(current_table_lines)
                if headers and rows:
                    tables.append((headers, rows))
                current_table_lines = []
                in_table = False

    # Handle last table
    if current_table_lines:
        headers, rows = parse_markdown_table(current_table_lines)
        if headers and rows:
            tables.append((headers, rows))

    return tables


def identify_region_from_rows(rows):
    """
    Try to identify which region a table belongs to based on row data.
    Look at 'Opportunity: Opp Owner Sales Region' column values.
    """
    region_col = "Opportunity: Opp Owner Sales Region"
    if not rows:
        return "UNKNOWN"

    regions_seen = set()
    for row in rows:
        val = row.get(region_col, "").strip().upper()
        if val:
            regions_seen.add(val)

    # Check majority region
    region_counts = {}
    for row in rows:
        val = row.get(region_col, "").strip().upper()
        if val:
            region_counts[val] = region_counts.get(val, 0) + 1

    if not region_counts:
        return "UNKNOWN"

    # Determine which of our 4 regions
    primary = max(region_counts, key=region_counts.get)

    if "APAC" in primary:
        return "APAC"
    elif "MENA" in primary:
        return "MENA"
    elif primary in ("UK", "EU"):
        return "UK+EU"
    elif "NORAM" in primary:
        return "NORAM"
    else:
        return primary


def normalize_name(name):
    """Normalize account name for comparison."""
    # Remove trailing commas and unicode commas
    name = name.rstrip("，,").strip()
    # Normalize whitespace
    name = re.sub(r"\s+", " ", name.strip()).lower()
    # Remove punctuation differences: commas before LLC/Ltd/Inc/Corp
    name = re.sub(r",\s*(llc|ltd|inc|corp|pty|pte|co)", r" \1", name)
    # Normalize "inc." vs "inc", "ltd." vs "ltd"
    name = re.sub(r"\b(inc|ltd|llc|corp)\.", r"\1", name)
    # Normalize multiple spaces again
    name = re.sub(r"\s+", " ", name).strip()
    return name


def main():
    print("Loading source file...")
    content = load_source_content()
    print(f"Content length: {len(content)} chars")

    print("Extracting tables...")
    tables = extract_tables_from_content(content)
    print(f"Found {len(tables)} tables")

    for i, (headers, rows) in enumerate(tables):
        region = identify_region_from_rows(rows)
        print(f"  Table {i+1}: {len(rows)} rows, detected region: {region}, first header: {headers[0] if headers else 'N/A'}")

    # Load assignments
    print("\nLoading assignments CSV...")
    assignments = []
    with open(ASSIGNMENTS_FILE, "r", encoding="utf-8") as f:
        reader = csv.DictReader(f)
        for row in reader:
            assignments.append({
                "region": row["Region"].strip(),
                "account_name": row["Account Name"].strip(),
                "ab_test": row["AB Test"].strip(),
            })
    print(f"Loaded {len(assignments)} assignments")

    # Build lookup: normalized_name -> assignment
    assignment_lookup = {}
    for a in assignments:
        key = normalize_name(a["account_name"])
        assignment_lookup[key] = a

    # Now build the combined spreadsheet data
    # We need the canonical column set for the main tables (first 4 tables with AB test column)
    # Some tables have slightly different header names; we'll use the first main table's headers as canonical

    # First, let's identify which tables have the "AB test" column (the main 4 regional tables)
    main_tables = []
    for headers, rows in tables:
        has_ab = any("AB test" in h or "AB Test" in h for h in headers)
        has_account = any("Account Name" in h for h in headers)
        if has_ab and has_account:
            main_tables.append((headers, rows))
        else:
            print(f"  Skipping table without AB test column (headers: {headers[:3]}...)")

    print(f"\nMain tables with AB test column: {len(main_tables)}")

    # Identify regions for each main table
    main_tables_with_region = []
    for headers, rows in main_tables:
        region = identify_region_from_rows(rows)
        main_tables_with_region.append((region, headers, rows))
        print(f"  Region {region}: {len(rows)} rows")

    # Define canonical output columns
    # Use the first table's headers as base; normalize header names across tables
    canonical_headers = None
    for region, headers, rows in main_tables_with_region:
        if canonical_headers is None:
            canonical_headers = list(headers)
            break

    # Normalize header names: strip extra whitespace, normalize line breaks in headers
    def normalize_header(h):
        h = re.sub(r"\s+", " ", h.strip())
        return h

    canonical_headers_normalized = [normalize_header(h) for h in canonical_headers]
    print(f"\nCanonical headers ({len(canonical_headers_normalized)}): {canonical_headers_normalized}")

    # Build a flat list of all rows from all main tables, tagged with region
    # Each row will use the canonical column mapping
    all_spreadsheet_rows = []

    # First, build per-table header normalization maps
    for region, headers, rows in main_tables_with_region:
        norm_headers = [normalize_header(h) for h in headers]
        # Map from canonical header -> this table's header
        col_map = {}
        for ch in canonical_headers_normalized:
            # Try exact match first
            if ch in norm_headers:
                col_map[ch] = ch
            else:
                # Try fuzzy: find most similar
                # For date columns that differ in naming
                found = None
                for nh in norm_headers:
                    if ch in nh or nh in ch:
                        found = nh
                        break
                if found:
                    col_map[ch] = found
                else:
                    col_map[ch] = None

        for row in rows:
            # Build normalized row using canonical headers
            norm_row = {"__region__": region}
            for ch in canonical_headers_normalized:
                target_h = col_map.get(ch)
                if target_h:
                    # Find the original header that matches target_h
                    val = ""
                    for orig_h in headers:
                        if normalize_header(orig_h) == target_h:
                            val = row.get(orig_h, "")
                            break
                    norm_row[ch] = val
                else:
                    norm_row[ch] = ""
            all_spreadsheet_rows.append(norm_row)

    print(f"\nTotal spreadsheet rows collected: {len(all_spreadsheet_rows)}")

    # Build lookup from spreadsheet: normalized account name -> row
    spreadsheet_lookup = {}
    account_col = None
    for ch in canonical_headers_normalized:
        if "Account Name" in ch:
            account_col = ch
            break

    print(f"Account column: {account_col}")

    for row in all_spreadsheet_rows:
        name = row.get(account_col, "").strip()
        # Also handle trailing comma in names like "Maxwell Smart Kitchen Development Pte. Ltd，"
        name_clean = name.rstrip("，,").strip()
        key = normalize_name(name_clean)
        if key and key not in spreadsheet_lookup:
            spreadsheet_lookup[key] = row
        elif key:
            # Duplicate - keep first occurrence
            pass

    print(f"Spreadsheet lookup entries: {len(spreadsheet_lookup)}")

    # Find AB test column name
    ab_col = None
    for ch in canonical_headers_normalized:
        if ch.lower() == "ab test":
            ab_col = ch
            break

    print(f"AB test column: {ab_col}")

    # Match assignments to spreadsheet rows
    output_rows = []
    matched = 0
    unmatched = []

    for assignment in assignments:
        key = normalize_name(assignment["account_name"])

        # Try exact match first
        match = spreadsheet_lookup.get(key)

        # If no exact match, try partial matches
        if not match:
            # Try removing ", Inc." / ", LLC" / ", Ltd." variants
            key_simplified = re.sub(r"\s+(inc|llc|ltd|corp|pty|pte|co\.?)(\s|$)", "", key).strip()
            for sk, srow in spreadsheet_lookup.items():
                sk_simplified = re.sub(r"\s+(inc|llc|ltd|corp|pty|pte|co\.?)(\s|$)", "", sk).strip()
                # Check if simplified keys match, or if one is a prefix of the other
                if (key_simplified and sk_simplified and
                        (key_simplified == sk_simplified or
                         key_simplified in sk_simplified or
                         sk_simplified in key_simplified)):
                    match = srow
                    print(f"  Partial match: '{assignment['account_name']}' -> '{srow.get(account_col, '')}'")
                    break

        # Still no match? Try word-overlap matching for longer names
        if not match:
            key_words = set(re.findall(r"\b\w{4,}\b", key))
            best_score = 0
            best_row = None
            for sk, srow in spreadsheet_lookup.items():
                sk_words = set(re.findall(r"\b\w{4,}\b", sk))
                if not key_words or not sk_words:
                    continue
                overlap = len(key_words & sk_words)
                score = overlap / max(len(key_words), len(sk_words))
                if score > best_score and score >= 0.7:
                    best_score = score
                    best_row = srow
            if best_row:
                match = best_row
                print(f"  Word-overlap match (score={best_score:.2f}): '{assignment['account_name']}' -> '{best_row.get(account_col, '')}'")


        if match:
            # Clone the row
            out_row = dict(match)
            # Overwrite AB test
            if ab_col:
                out_row[ab_col] = assignment["ab_test"]
            # Override region from assignments CSV
            out_row["__region__"] = assignment["region"]
            matched += 1
        else:
            # Unmatched: create sparse row
            out_row = {"__region__": assignment["region"]}
            for ch in canonical_headers_normalized:
                out_row[ch] = ""
            if ab_col:
                out_row[ab_col] = assignment["ab_test"]
            if account_col:
                out_row[account_col] = assignment["account_name"]
            unmatched.append(assignment["account_name"])
            print(f"  UNMATCHED: '{assignment['account_name']}'")

        output_rows.append(out_row)

    print(f"\nMatched: {matched}")
    print(f"Unmatched: {len(unmatched)}")
    if unmatched:
        print("Unmatched merchants:")
        for u in unmatched:
            print(f"  - {u}")

    # Write output CSV
    # Build final header list: Region first, then all canonical headers
    # Map AB test column to "AB Test" in output, and Region column from __region__
    output_headers = ["Region"] + canonical_headers_normalized

    print(f"\nWriting {len(output_rows)} rows to {OUTPUT_FILE}...")

    with open(OUTPUT_FILE, "w", newline="", encoding="utf-8") as f:
        writer = csv.DictWriter(f, fieldnames=output_headers, quoting=csv.QUOTE_MINIMAL, extrasaction="ignore")
        writer.writeheader()
        for row in output_rows:
            out = {}
            out["Region"] = row.get("__region__", "")
            for ch in canonical_headers_normalized:
                out[ch] = row.get(ch, "")
            writer.writerow(out)

    print(f"Done! Output written to {OUTPUT_FILE}")
    print(f"\nSummary: {matched} matched, {len(unmatched)} unmatched out of {len(assignments)} total assignments")

    return matched, unmatched


if __name__ == "__main__":
    matched, unmatched = main()
    sys.exit(0)
