# DSR Tracker — Setup Guide

## What this builds

A Google Sheets add-on (Apps Script) that gives the whole DM team:

1. **A shared, enforced definition of when a DSR starts and closes**
2. **Automatic expected-time calculation** for every DSR based on the scoring model
3. **Milestone tracking** with earned-points accumulation
4. **Salesforce CSV import** to populate deals without manual entry

---

## DSR Lifecycle Mandate (team-wide standard)

| Event | Action | Meaning |
|---|---|---|
| **▶ START** | MAF Sent | DM sends the MAF link to merchant. Engagement begins. Cycle time starts. |
| ⏩ Milestone | MAF Submitted | Merchant completes the form. Earns 30% of expected points. |
| ⏩ Milestone | MAF Approved | UW/Risk approves. Earns 70% of expected points. |
| **🏁 CLOSE** | MID Issue | Merchant goes live. Revenue realized. Cycle time ends. Earns 100% of points. |

---

## Scoring Model (1 point = 1 standard hour)

### Baseline
| Opportunity Type | Expected Hours |
|---|---|
| New Business | 6.0 h |
| Cross-Sell | 5.0 h |
| Upsell / Downsell | 3.0 h |

### Complexity Add-ons
| Attribute | Add-on |
|---|---|
| Gold incentive | +4.0 h |
| Silver incentive | +3.0 h |
| Complex merchant (Payfac / Marketplace / Digital Wallet) | +4.0 h |
| Cross-Region deal | +3.0 h |
| Gateway Only model | −1.5 h |

### Task Add-ons
| Task | Add-on |
|---|---|
| Payout Onboarding | +3.5 h |
| Breakglass Pricing | +2.0 h |
| NDA Handling | +2.0 h |
| Standalone VAS | +3.0 h |

---

## Installation (one-time, takes ~5 minutes)

### Step 1 — Create the Google Sheet

1. Go to [sheets.google.com](https://sheets.google.com) and create a new blank spreadsheet.
2. Name it **"DSR Tracker"** (or any name you prefer).

### Step 2 — Open Apps Script

1. In the spreadsheet, click **Extensions → Apps Script**.
2. Delete the placeholder `myFunction()` code in `Code.gs`.

### Step 3 — Copy the script files

Copy the contents of each file into Apps Script:

| File | Where to paste |
|---|---|
| `Code.gs` | Rename the default file to `Code.gs` and paste |
| `ImportSidebar.html` | Click **+** → **HTML** → name it `ImportSidebar` → paste |

### Step 4 — Save and run Setup

1. Click **Save** (disk icon).
2. Close Apps Script and **refresh the Google Sheet**.
3. A new menu **"DSR Management"** will appear in the menu bar.
4. Click **DSR Management → 📋 Setup Sheets**.
5. Approve the permissions prompt (one-time).

The script creates two sheets:
- **DSR Log** — main tracking sheet with dropdown validation
- **Scoring Model** — reference table for all expected-time values

### Step 5 — Share with the team

Share the Google Sheet with all DMs (Editor access). Everyone will see the same **"DSR Management"** menu and can start/close DSRs with a single click.

---

## Daily Usage

### Starting a DSR
1. Add the deal row (manually or via Salesforce import).
2. Fill in: Opp Type, Incentive, Merchant Type, Model Type, Cross-Region?, and any Task Add-ons.
3. Select the row.
4. Click **DSR Management → ▶ Start DSR (MAF Sent)** — records today's date as the official start.

> ⚡ Or import from Salesforce: if `MAF Sent Date` is already populated in Salesforce, it imports automatically.

### Advancing milestones
Use the menu actions in order:
- **⏩ Advance to MAF Submitted** — when merchant submits the form
- **✅ Advance to MAF Approved** — when UW/Risk approves
- **🏁 Close DSR (MID Issued)** — when merchant goes live

Each action records a timestamp and updates earned points.

### Importing from Salesforce
1. Run a Salesforce report with the DSR fields listed in the column mapping.
2. Export as CSV.
3. Click **DSR Management → 📥 Import from Salesforce CSV**.
4. Paste the CSV into the sidebar → click **Import DSRs**.

Duplicate Deal IDs are automatically skipped on re-import.

---

## Key Columns in DSR Log

| Column | Meaning |
|---|---|
| Expected Hours | Auto-calculated from scoring model |
| Status | Current lifecycle stage |
| MAF Sent Date ★ | **DSR START** — populated by "Start DSR" action |
| MID Issue Date ★ | **DSR CLOSE** — populated by "Close DSR" action |
| Cycle Days | MID Issue − MAF Sent (auto-calculated on close) |
| Earned Points | Points accumulated based on milestones reached |
