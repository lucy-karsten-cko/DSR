// =============================================================================
// DSR (Deal Support Request) Tracker — Google Apps Script
// =============================================================================
// DSR LIFECYCLE MANDATE (team-wide standard):
//   START  = MAF Send date  (DM sends MAF link to merchant; DM is now engaged)
//   CLOSE  = Work Complete date — when THIS specific piece of DSR work is done.
//            "Done" depends on what the DSR covers:
//              Full deal          → typically MID Issue
//              NDA task           → NDA Signed
//              Payout task        → Payout Configured
//              Breakglass task    → Pricing Approved
//              Other              → whatever milestone ends this work
//
// Expected time is calculated from the scoring model in the "Scoring Model"
// sheet and is based on: Opportunity Type (baseline) + Complexity Add-ons
// (Incentive Rate, Regional Attribute, Merchant Type, Model Type) + Task
// Add-ons (Payout, Breakglass, NDA, Standalone VAS).
// =============================================================================

// ─── Column indices for "DSR Log" sheet (1-based) ────────────────────────────
var COL = {
  DEAL_ID:             1,
  OPP_NAME:            2,
  DM_NAME:             3,
  REGION:              4,
  OPP_TYPE:            5,   // New Business | Cross-Sell | Upsell/Downsell
  INCENTIVE:           6,   // Gold | Silver | Bronze
  MERCHANT_TYPE:       7,   // Complex (Payfac/Marketplace/Digital Wallet) | Merchant
  MODEL_TYPE:          8,   // Acquiring | Gateway Only
  IS_CROSS_REGION:     9,   // TRUE/FALSE
  ADDON_PAYOUT:       10,   // TRUE/FALSE
  ADDON_BREAKGLASS:   11,   // TRUE/FALSE
  ADDON_NDA:          12,   // TRUE/FALSE
  ADDON_VAS:          13,   // TRUE/FALSE
  EXPECTED_HOURS:     14,   // Auto-calculated
  STATUS:             15,   // Open | MAF Sent | MAF Submitted | MAF Approved | Closed
  MAF_SENT_DATE:      16,   // DSR START — set when status moves to "MAF Sent"
  MAF_SUBMIT_DATE:    17,
  MAF_APPROVE_DATE:   18,
  WORK_COMPLETE_DATE: 19,   // DSR CLOSE — when this specific piece of work is done
  CLOSE_REASON:       20,   // What completed this DSR (NDA Signed, MID Issued, etc.)
  CYCLE_DAYS:         21,   // WORK_COMPLETE_DATE - MAF_SENT_DATE
  EARNED_POINTS:      22,   // Points earned so far based on milestone weights
  NOTES:              23,
};

var DSR_LOG_SHEET   = "DSR Log";
var SCORING_SHEET   = "Scoring Model";

// ─── Scoring model (1 point = 1 standard hour) ───────────────────────────────
var BASELINE = {
  "New Business":     6.0,
  "Cross-Sell":       5.0,
  "Upsell/Downsell":  3.0,
};

var COMPLEXITY_ADDONS = {
  incentive: { "Gold": 4.0, "Silver": 3.0, "Bronze": 0 },
  merchantType: { "Complex": 4.0, "Merchant": 0 },
  crossRegion: 3.0,
  gatewayOnly: -1.5,
};

var TASK_ADDONS = {
  payout:     3.5,
  breakglass: 2.0,
  nda:        2.0,
  vas:        3.0,
};

// Milestone weights for earned-points calculation
var MILESTONE_WEIGHTS = {
  mafSent:     0.20,
  mafSubmit:   0.10,
  mafApprove:  0.40,
  midIssue:    0.30,
};

// ─── Lifecycle status order ───────────────────────────────────────────────────
var STATUS_ORDER = ["Open", "MAF Sent", "MAF Submitted", "MAF Approved", "Closed"];

// =============================================================================
// MENU
// =============================================================================
function onOpen() {
  SpreadsheetApp.getUi()
    .createMenu("DSR Management")
    .addItem("📋 Setup Sheets", "setupSheets")
    .addSeparator()
    .addItem("▶ Start DSR (MAF Sent)", "startSelectedDSRs")
    .addItem("⏩ Advance to MAF Submitted", "advanceToMAFSubmitted")
    .addItem("✅ Advance to MAF Approved", "advanceToMAFApproved")
    .addItem("🏁 Close DSR (Work Complete)", "closeSelectedDSRs")
    .addSeparator()
    .addItem("🔄 Recalculate Expected Hours", "recalculateAllExpectedHours")
    .addItem("📊 Refresh Earned Points", "refreshAllEarnedPoints")
    .addSeparator()
    .addItem("📥 Import from Salesforce CSV", "showImportSidebar")
    .addItem("ℹ️  DSR Lifecycle Rules", "showLifecycleRules")
    .addSeparator()
    .addItem("📊 Create MAF Journey Slide", "createMAFJourneySlide")
    .addToUi();
}

// =============================================================================
// SETUP
// =============================================================================
function setupSheets() {
  var ss = SpreadsheetApp.getActiveSpreadsheet();

  // ── DSR Log sheet ──────────────────────────────────────────────────────────
  var logSheet = ss.getSheetByName(DSR_LOG_SHEET) || ss.insertSheet(DSR_LOG_SHEET);
  if (logSheet.getLastRow() === 0) {
    var headers = [
      "Deal ID", "Opportunity Name", "DM Name", "Region",
      "Opp Type", "Incentive", "Merchant Type", "Model Type",
      "Cross-Region?", "Payout Add-on?", "Breakglass Add-on?", "NDA Add-on?", "VAS Add-on?",
      "Expected Hours", "Status",
      "MAF Sent Date ★ START", "MAF Submitted Date", "MAF Approved Date",
      "Work Complete Date ★ CLOSE", "Completion Event",
      "Cycle Days", "Earned Points", "Notes"
    ];
    logSheet.appendRow(headers);

    // Style header row
    var headerRange = logSheet.getRange(1, 1, 1, headers.length);
    headerRange.setBackground("#1a73e8").setFontColor("white").setFontWeight("bold");
    logSheet.setFrozenRows(1);

    // Highlight the START and CLOSE columns
    logSheet.getRange(1, COL.MAF_SENT_DATE).setBackground("#0d652d").setFontColor("white");
    logSheet.getRange(1, COL.WORK_COMPLETE_DATE).setBackground("#b31412").setFontColor("white");
    logSheet.getRange(1, COL.CLOSE_REASON).setBackground("#b31412").setFontColor("white");

    // Data validation for key columns
    _applyValidation(logSheet, COL.OPP_TYPE, Object.keys(BASELINE));
    _applyValidation(logSheet, COL.INCENTIVE, ["Gold", "Silver", "Bronze"]);
    _applyValidation(logSheet, COL.MERCHANT_TYPE, ["Complex", "Merchant"]);
    _applyValidation(logSheet, COL.MODEL_TYPE, ["Acquiring", "Gateway Only"]);
    _applyValidation(logSheet, COL.IS_CROSS_REGION, ["TRUE", "FALSE"]);
    _applyValidation(logSheet, COL.ADDON_PAYOUT, ["TRUE", "FALSE"]);
    _applyValidation(logSheet, COL.ADDON_BREAKGLASS, ["TRUE", "FALSE"]);
    _applyValidation(logSheet, COL.ADDON_NDA, ["TRUE", "FALSE"]);
    _applyValidation(logSheet, COL.ADDON_VAS, ["TRUE", "FALSE"]);
    _applyValidation(logSheet, COL.STATUS, STATUS_ORDER);
    _applyValidation(logSheet, COL.CLOSE_REASON, [
      "NDA Signed",
      "Payout Configured",
      "Pricing Approved",
      "MAF Approved",
      "Contract Signed",
      "MID Issued",
      "Other"
    ]);
  }

  // ── Scoring Model sheet ───────────────────────────────────────────────────
  _buildScoringModelSheet(ss);

  SpreadsheetApp.getUi().alert(
    "✅ Sheets are ready.\n\n" +
    "DSR LIFECYCLE MANDATE:\n" +
    "  START = MAF Sent date\n" +
    "  CLOSE = Work Complete date\n" +
    "          (when THIS specific piece of work is done)\n\n" +
    "Use the \"DSR Management\" menu to manage DSRs."
  );
}

function _buildScoringModelSheet(ss) {
  var sheet = ss.getSheetByName(SCORING_SHEET) || ss.insertSheet(SCORING_SHEET);
  sheet.clearContents();

  var rows = [
    ["DSR SCORING MODEL — 1 Point = 1 Standard Hour", "", ""],
    ["", "", ""],
    ["BASELINE (Opportunity Type)", "Hours", "Notes"],
    ["New Business", 6.0, "New contracts; full legal, finance & compliance review"],
    ["Cross-Sell", 5.0, "New entity for existing customer; new KYC & legal terms"],
    ["Upsell / Downsell", 3.0, "Amendment to existing contract/rates"],
    ["", "", ""],
    ["COMPLEXITY ADD-ONS", "Hours", "Notes"],
    ["Incentive: Gold", 4.0, "High discounts, non-standard terms, multi-level exec approval"],
    ["Incentive: Silver", 3.0, "Non-standard terms; standard approval path"],
    ["Incentive: Bronze", 0, "Baseline — no add-on"],
    ["Merchant Type: Complex (Payfac/Marketplace/Digital Wallet)", 4.0, "Complex fund flow analysis; KYB/UBO structure review"],
    ["Merchant Type: Merchant", 0, "Baseline — no add-on"],
    ["Cross-Region Deal", 3.0, "Cross-timezone, multi-jurisdiction compliance"],
    ["Gateway Only Model", -1.5, "DEDUCTION — no fund settlement; less Risk/UW interaction"],
    ["", "", ""],
    ["TASK ADD-ONS", "Hours", "Notes"],
    ["Payout Onboarding", 3.5, "Manual doc validation against Payout Guides; high RFI risk"],
    ["Breakglass Pricing Approval", 2.0, "Non-standard pricing; manual doc editing friction"],
    ["NDA Handling", 2.0, "Client-paper NDA; clause comparison & Legal liaison"],
    ["Standalone VAS Onboarding", 3.0, "Standalone Value-Added Service configuration & setup"],
    ["", "", ""],
    ["MILESTONE WEIGHTS (Earned Points)", "Weight", ""],
    ["MAF Send", "20%", "Pre-coordination complete; DM engagement begins → DSR STARTS here"],
    ["MAF Submit", "10%", "System submission action"],
    ["MAF Approve", "40%", "Core approval work; most DM effort concentrated here"],
    ["MID Issue / Contract Signed", "30%", "One possible close event for full-deal DSRs"],
  ];

  sheet.getRange(1, 1, rows.length, 3).setValues(rows);

  // Formatting
  sheet.getRange(1, 1).setFontWeight("bold").setFontSize(13).setBackground("#1a73e8").setFontColor("white");
  [3, 8, 17, 23].forEach(function(r) {
    sheet.getRange(r, 1, 1, 3).setFontWeight("bold").setBackground("#e8f0fe");
  });
  sheet.setColumnWidth(1, 380);
  sheet.setColumnWidth(2, 100);
  sheet.setColumnWidth(3, 420);
}

function _applyValidation(sheet, col, values) {
  var rule = SpreadsheetApp.newDataValidation()
    .requireValueInList(values, true)
    .setAllowInvalid(false)
    .build();
  sheet.getRange(2, col, 500, 1).setDataValidation(rule);
}

// =============================================================================
// LIFECYCLE ACTIONS — operate on selected rows
// =============================================================================

/**
 * Returns the row indices of all selected data rows (excluding header).
 */
function _getSelectedRows(sheet) {
  var selection = sheet.getActiveRange();
  var rows = [];
  for (var r = selection.getRow(); r <= selection.getLastRow(); r++) {
    if (r > 1) rows.push(r);
  }
  return rows;
}

function _advanceStatus(targetStatus, dateCol, closeReason) {
  var ss = SpreadsheetApp.getActiveSpreadsheet();
  var sheet = ss.getSheetByName(DSR_LOG_SHEET);
  if (!sheet) { SpreadsheetApp.getUi().alert("Run Setup Sheets first."); return; }

  var rows = _getSelectedRows(sheet);
  if (rows.length === 0) { SpreadsheetApp.getUi().alert("Select one or more DSR rows first."); return; }

  var now = new Date();
  var updated = 0;

  rows.forEach(function(row) {
    var currentStatus = sheet.getRange(row, COL.STATUS).getValue();
    var currentIdx = STATUS_ORDER.indexOf(currentStatus);
    var targetIdx = STATUS_ORDER.indexOf(targetStatus);

    if (targetIdx <= currentIdx) {
      // Already at or past this milestone — skip silently
      return;
    }

    sheet.getRange(row, COL.STATUS).setValue(targetStatus);
    if (dateCol) sheet.getRange(row, dateCol).setValue(now);
    // closeReason is only passed for the Close action


    // If closing, record completion event and compute cycle days
    if (targetStatus === "Closed") {
      if (closeReason) sheet.getRange(row, COL.CLOSE_REASON).setValue(closeReason);
      var startDate = sheet.getRange(row, COL.MAF_SENT_DATE).getValue();
      if (startDate instanceof Date) {
        var cycleDays = Math.round((now - startDate) / (1000 * 60 * 60 * 24) * 10) / 10;
        sheet.getRange(row, COL.CYCLE_DAYS).setValue(cycleDays);
      }
    }

    _updateEarnedPoints(sheet, row);
    updated++;
  });

  SpreadsheetApp.getUi().alert(
    updated + " DSR(s) updated to \"" + targetStatus + "\".\n" +
    (updated < rows.length ? (rows.length - updated) + " DSR(s) skipped (already at or past this stage)." : "")
  );
}

/**
 * START: sets status to "MAF Sent" and records the start date.
 * This is the official DSR start — DM is engaged and MAF link has been sent.
 */
function startSelectedDSRs() {
  _advanceStatus("MAF Sent", COL.MAF_SENT_DATE);
}

function advanceToMAFSubmitted() {
  _advanceStatus("MAF Submitted", COL.MAF_SUBMIT_DATE);
}

function advanceToMAFApproved() {
  _advanceStatus("MAF Approved", COL.MAF_APPROVE_DATE);
}

/**
 * CLOSE: sets status to "Closed" and records Work Complete date + completion event.
 * "Done" means this specific piece of DSR work is finished — not necessarily MID Issue.
 */
function closeSelectedDSRs() {
  var ui = SpreadsheetApp.getUi();
  var response = ui.prompt(
    "Close DSR — Completion Event",
    "What completed this work?\n\n" +
    "  1  NDA Signed\n" +
    "  2  Payout Configured\n" +
    "  3  Pricing Approved\n" +
    "  4  MAF Approved\n" +
    "  5  Contract Signed\n" +
    "  6  MID Issued\n" +
    "  7  Other\n\n" +
    "Enter the number (or type a custom reason):",
    ui.ButtonSet.OK_CANCEL
  );

  if (response.getSelectedButton() !== ui.Button.OK) return;

  var closeReasonMap = {
    "1": "NDA Signed",
    "2": "Payout Configured",
    "3": "Pricing Approved",
    "4": "MAF Approved",
    "5": "Contract Signed",
    "6": "MID Issued",
    "7": "Other"
  };
  var input = (response.getResponseText() || "").trim();
  var closeReason = closeReasonMap[input] || (input || "Other");

  _advanceStatus("Closed", COL.WORK_COMPLETE_DATE, closeReason);
}

// =============================================================================
// EXPECTED HOURS CALCULATION
// =============================================================================

function calculateExpectedHours(oppType, incentive, merchantType, modelType, isCrossRegion, addPayout, addBreakglass, addNDA, addVAS) {
  var hours = BASELINE[oppType] || 0;

  hours += COMPLEXITY_ADDONS.incentive[incentive] || 0;
  hours += COMPLEXITY_ADDONS.merchantType[merchantType] || 0;

  if (isCrossRegion === true || isCrossRegion === "TRUE") {
    hours += COMPLEXITY_ADDONS.crossRegion;
  }
  if (modelType === "Gateway Only") {
    hours += COMPLEXITY_ADDONS.gatewayOnly;
  }

  if (addPayout === true || addPayout === "TRUE")     hours += TASK_ADDONS.payout;
  if (addBreakglass === true || addBreakglass === "TRUE") hours += TASK_ADDONS.breakglass;
  if (addNDA === true || addNDA === "TRUE")           hours += TASK_ADDONS.nda;
  if (addVAS === true || addVAS === "TRUE")           hours += TASK_ADDONS.vas;

  return Math.round(hours * 10) / 10;
}

function recalculateAllExpectedHours() {
  var ss = SpreadsheetApp.getActiveSpreadsheet();
  var sheet = ss.getSheetByName(DSR_LOG_SHEET);
  if (!sheet) { SpreadsheetApp.getUi().alert("Run Setup Sheets first."); return; }

  var lastRow = sheet.getLastRow();
  if (lastRow < 2) return;

  for (var row = 2; row <= lastRow; row++) {
    var vals = sheet.getRange(row, 1, 1, COL.ADDON_VAS).getValues()[0];
    if (!vals[COL.OPP_TYPE - 1]) continue; // skip empty rows

    var expected = calculateExpectedHours(
      vals[COL.OPP_TYPE - 1],
      vals[COL.INCENTIVE - 1],
      vals[COL.MERCHANT_TYPE - 1],
      vals[COL.MODEL_TYPE - 1],
      vals[COL.IS_CROSS_REGION - 1],
      vals[COL.ADDON_PAYOUT - 1],
      vals[COL.ADDON_BREAKGLASS - 1],
      vals[COL.ADDON_NDA - 1],
      vals[COL.ADDON_VAS - 1]
    );
    sheet.getRange(row, COL.EXPECTED_HOURS).setValue(expected);
  }

  SpreadsheetApp.getUi().alert("Expected hours recalculated for all DSRs.");
}

// =============================================================================
// EARNED POINTS
// =============================================================================

/**
 * Recalculates earned points for a single row based on milestones reached.
 * Points are proportionally allocated: MAF Sent 20%, Submit 10%, Approve 40%, Close 30%.
 */
function _updateEarnedPoints(sheet, row) {
  var expected   = sheet.getRange(row, COL.EXPECTED_HOURS).getValue();
  var status     = sheet.getRange(row, COL.STATUS).getValue();

  if (!expected || !status) return;

  var weight = 0;
  var idx = STATUS_ORDER.indexOf(status);
  if (idx >= 1) weight += MILESTONE_WEIGHTS.mafSent;      // MAF Sent
  if (idx >= 2) weight += MILESTONE_WEIGHTS.mafSubmit;    // MAF Submitted
  if (idx >= 3) weight += MILESTONE_WEIGHTS.mafApprove;   // MAF Approved
  if (idx >= 4) weight += MILESTONE_WEIGHTS.midIssue;     // Closed (work complete)

  var earned = Math.round(expected * weight * 10) / 10;
  sheet.getRange(row, COL.EARNED_POINTS).setValue(earned);
}

function refreshAllEarnedPoints() {
  var ss = SpreadsheetApp.getActiveSpreadsheet();
  var sheet = ss.getSheetByName(DSR_LOG_SHEET);
  if (!sheet) return;

  var lastRow = sheet.getLastRow();
  for (var row = 2; row <= lastRow; row++) {
    _updateEarnedPoints(sheet, row);
  }
  SpreadsheetApp.getUi().alert("Earned points refreshed for all DSRs.");
}

// =============================================================================
// SALESFORCE CSV IMPORT
// =============================================================================

/**
 * Shows the import sidebar where users can paste Salesforce CSV data.
 * Expected CSV columns (from Salesforce report):
 *   Opportunity ID, Opportunity Name, Owner (DM), Region, Opportunity Type,
 *   Incentive Rate, Merchant Type, Model Type, Cross Region, Payout, Breakglass,
 *   NDA, VAS, Stage, MAF Sent Date, MAF Submitted Date, MAF Approved Date,
 *   Work Complete Date (or MID Issue Date), Completion Event
 */
function showImportSidebar() {
  var html = HtmlService.createHtmlOutputFromFile("ImportSidebar")
    .setTitle("Import from Salesforce")
    .setWidth(400);
  SpreadsheetApp.getUi().showSidebar(html);
}

/**
 * Called from ImportSidebar.html — processes pasted CSV rows.
 */
function importSalesforceData(csvText) {
  var ss = SpreadsheetApp.getActiveSpreadsheet();
  var sheet = ss.getSheetByName(DSR_LOG_SHEET);
  if (!sheet) setupSheets();
  sheet = ss.getSheetByName(DSR_LOG_SHEET);

  var lines = csvText.trim().split("\n");
  if (lines.length < 2) return { error: "No data rows found." };

  // Parse header to find column positions
  var header = _parseCSVLine(lines[0]);
  var SF = _mapSalesforceHeaders(header);

  var imported = 0;
  var skipped  = 0;

  // Build a map of existing Deal IDs to avoid duplicates
  var lastRow = sheet.getLastRow();
  var existingIds = {};
  if (lastRow >= 2) {
    var ids = sheet.getRange(2, COL.DEAL_ID, lastRow - 1, 1).getValues();
    ids.forEach(function(r) { if (r[0]) existingIds[r[0]] = true; });
  }

  for (var i = 1; i < lines.length; i++) {
    var cells = _parseCSVLine(lines[i]);
    if (cells.length < 2) continue;

    var dealId = SF.dealId >= 0 ? cells[SF.dealId] : "";
    if (dealId && existingIds[dealId]) { skipped++; continue; }

    var oppType    = _normOppType(SF.oppType >= 0 ? cells[SF.oppType] : "");
    var incentive  = _normIncentive(SF.incentive >= 0 ? cells[SF.incentive] : "Bronze");
    var merchantTy = _normMerchantType(SF.merchantType >= 0 ? cells[SF.merchantType] : "Merchant");
    var modelType  = _normModelType(SF.modelType >= 0 ? cells[SF.modelType] : "Acquiring");
    var crossReg   = _normBool(SF.crossRegion >= 0 ? cells[SF.crossRegion] : "FALSE");
    var payout     = _normBool(SF.payout >= 0 ? cells[SF.payout] : "FALSE");
    var breakglass = _normBool(SF.breakglass >= 0 ? cells[SF.breakglass] : "FALSE");
    var nda        = _normBool(SF.nda >= 0 ? cells[SF.nda] : "FALSE");
    var vas        = _normBool(SF.vas >= 0 ? cells[SF.vas] : "FALSE");
    var stage      = SF.stage >= 0 ? cells[SF.stage] : "Open";
    var status     = _normStatus(stage);

    var mafSentDate       = _parseDate(SF.mafSentDate >= 0 ? cells[SF.mafSentDate] : "");
    var mafSubmitDate     = _parseDate(SF.mafSubmitDate >= 0 ? cells[SF.mafSubmitDate] : "");
    var mafApproveDate    = _parseDate(SF.mafApproveDate >= 0 ? cells[SF.mafApproveDate] : "");
    var workCompleteDate  = _parseDate(SF.workCompleteDate >= 0 ? cells[SF.workCompleteDate] : "");
    var importCloseReason = SF.closeReason >= 0 ? cells[SF.closeReason] : "";

    var expected = calculateExpectedHours(oppType, incentive, merchantTy, modelType, crossReg, payout, breakglass, nda, vas);

    var cycleDays = "";
    if (mafSentDate && workCompleteDate) {
      cycleDays = Math.round((workCompleteDate - mafSentDate) / (1000 * 60 * 60 * 24) * 10) / 10;
    }

    var row = [
      dealId,
      SF.oppName >= 0 ? cells[SF.oppName] : "",
      SF.dmName >= 0 ? cells[SF.dmName] : "",
      SF.region >= 0 ? cells[SF.region] : "",
      oppType, incentive, merchantTy, modelType,
      crossReg, payout, breakglass, nda, vas,
      expected, status,
      mafSentDate || "", mafSubmitDate || "", mafApproveDate || "",
      workCompleteDate || "", importCloseReason,
      cycleDays, "", ""
    ];

    sheet.appendRow(row);
    if (dealId) existingIds[dealId] = true;

    // Compute earned points for the newly added row
    var newRow = sheet.getLastRow();
    _updateEarnedPoints(sheet, newRow);
    imported++;
  }

  return { imported: imported, skipped: skipped };
}

// ─── CSV / normalization helpers ──────────────────────────────────────────────

function _parseCSVLine(line) {
  var result = [];
  var cur = "";
  var inQuotes = false;
  for (var i = 0; i < line.length; i++) {
    var c = line[i];
    if (c === '"') {
      if (inQuotes && line[i + 1] === '"') { cur += '"'; i++; }
      else inQuotes = !inQuotes;
    } else if (c === ',' && !inQuotes) {
      result.push(cur.trim()); cur = "";
    } else {
      cur += c;
    }
  }
  result.push(cur.trim());
  return result;
}

/**
 * Maps Salesforce CSV header names to indices.
 * Header matching is case-insensitive and flexible.
 */
function _mapSalesforceHeaders(header) {
  var m = {};
  var find = function(patterns) {
    for (var i = 0; i < header.length; i++) {
      var h = header[i].toLowerCase();
      for (var j = 0; j < patterns.length; j++) {
        if (h.indexOf(patterns[j].toLowerCase()) >= 0) return i;
      }
    }
    return -1;
  };
  m.dealId       = find(["opportunity id", "opp id", "deal id", "sfdc id"]);
  m.oppName      = find(["opportunity name", "opp name", "deal name"]);
  m.dmName       = find(["owner", "dm name", "assigned to"]);
  m.region       = find(["region"]);
  m.oppType      = find(["opportunity type", "opp type", "deal type", "type"]);
  m.incentive    = find(["incentive", "priority", "incentive rate"]);
  m.merchantType = find(["merchant type", "merchant_type"]);
  m.modelType    = find(["model type", "model_type", "model"]);
  m.crossRegion  = find(["cross region", "cross_region"]);
  m.payout       = find(["payout"]);
  m.breakglass   = find(["breakglass", "break glass"]);
  m.nda          = find(["nda"]);
  m.vas          = find(["vas", "standalone vas"]);
  m.stage        = find(["stage", "status"]);
  m.mafSentDate      = find(["maf sent", "maf_sent"]);
  m.mafSubmitDate    = find(["maf submit", "maf_submit"]);
  m.mafApproveDate   = find(["maf approv", "maf_approv"]);
  m.workCompleteDate = find(["work complete", "mid issue", "mid_issue", "live date", "closed date", "completion date"]);
  m.closeReason      = find(["completion event", "close reason", "close_reason", "completion_event"]);
  return m;
}

function _normOppType(v) {
  v = (v || "").toLowerCase();
  if (v.indexOf("upsell") >= 0 || v.indexOf("downsell") >= 0) return "Upsell/Downsell";
  if (v.indexOf("cross") >= 0 || v.indexOf("sell") >= 0) return "Cross-Sell";
  return "New Business";
}

function _normIncentive(v) {
  v = (v || "").toLowerCase();
  if (v.indexOf("gold") >= 0)   return "Gold";
  if (v.indexOf("silver") >= 0) return "Silver";
  return "Bronze";
}

function _normMerchantType(v) {
  v = (v || "").toLowerCase();
  if (v.indexOf("payfac") >= 0 || v.indexOf("marketplace") >= 0 || v.indexOf("wallet") >= 0 || v.indexOf("crypto") >= 0) {
    return "Complex";
  }
  return "Merchant";
}

function _normModelType(v) {
  v = (v || "").toLowerCase();
  return v.indexOf("gateway") >= 0 ? "Gateway Only" : "Acquiring";
}

function _normBool(v) {
  v = (v || "").toLowerCase();
  return (v === "true" || v === "yes" || v === "1" || v === "y") ? "TRUE" : "FALSE";
}

function _normStatus(stage) {
  stage = (stage || "").toLowerCase();
  if (stage.indexOf("closed") >= 0 || stage.indexOf("mid") >= 0 || stage.indexOf("live") >= 0) return "Closed";
  if (stage.indexOf("approv") >= 0)   return "MAF Approved";
  if (stage.indexOf("submit") >= 0)   return "MAF Submitted";
  if (stage.indexOf("sent") >= 0 || stage.indexOf("maf") >= 0) return "MAF Sent";
  return "Open";
}

function _parseDate(v) {
  if (!v) return null;
  var d = new Date(v);
  return isNaN(d.getTime()) ? null : d;
}

// =============================================================================
// INFO DIALOG
// =============================================================================
function showLifecycleRules() {
  var msg =
    "📋 DSR LIFECYCLE MANDATE\n" +
    "══════════════════════════════════\n\n" +
    "▶ START  —  MAF Sent\n" +
    "  The DM sends the MAF link to the merchant.\n" +
    "  This is the official moment DM engagement begins.\n" +
    "  Cycle time starts here.\n\n" +
    "⏩ MILESTONE  —  MAF Submitted\n" +
    "  The merchant completes and submits the MAF.\n" +
    "  Earns 30% of expected points (MAF Sent 20% + Submit 10%).\n\n" +
    "⏩ MILESTONE  —  MAF Approved\n" +
    "  Underwriting / Risk approves the MAF.\n" +
    "  Earns 70% of expected points (adds Approve 40%).\n\n" +
    "🏁 CLOSE  —  Work Complete\n" +
    "  This specific piece of DSR work is done.\n" +
    "  \"Done\" depends on what the DSR covers:\n" +
    "    Full deal      → MID Issued\n" +
    "    NDA task       → NDA Signed\n" +
    "    Payout task    → Payout Configured\n" +
    "    Breakglass     → Pricing Approved\n" +
    "    Other          → whatever ends this work\n" +
    "  Earns 100% of expected points.\n\n" +
    "══════════════════════════════════\n" +
    "Cycle Days = Work Complete Date − MAF Sent Date";

  SpreadsheetApp.getUi().alert(msg);
}

// =============================================================================
// MAF JOURNEY SLIDE GENERATOR
// =============================================================================

/**
 * Creates (or replaces) a Google Slides presentation with the Step 4 MAF
 * journey slide — TODAY chaos vs PROPOSED AI-first/#OneTeam approach.
 *
 * Run from: DSR Management → Create MAF Journey Slide
 * The presentation URL is shown in an alert when done.
 */
function createMAFJourneySlide() {
  var pres = SlidesApp.create("DSR Journey — Step 4 MAF");
  var slide = pres.getSlides()[0];
  slide.getBackground().setSolidFill("#FFFFFF");

  var W = 720, H = 405; // points (standard 16:9 at 10-inch wide = 720pt)

  // ── Title ──────────────────────────────────────────────────────────────────
  var title = slide.insertTextBox("Journey today + proposed journey");
  title.setLeft(32).setTop(18).setWidth(656).setHeight(32);
  var ts = title.getText().getTextStyle();
  ts.setFontSize(20).setBold(true).setForegroundColor("#1a1a2e");

  // ── Step badge ─────────────────────────────────────────────────────────────
  var badge = slide.insertShape(SlidesApp.ShapeType.RECTANGLE, 32, 58, 100, 28);
  badge.getFill().setSolidFill("#1a1a2e");
  badge.getBorder().setTransparent();
  var badgeTxt = badge.getText();
  badgeTxt.setText("STEP  4  ·  MAF");
  badgeTxt.getTextStyle().setFontSize(9).setBold(true).setForegroundColor("#FFFFFF");
  badgeTxt.getParagraphStyle().setParagraphAlignment(SlidesApp.ParagraphAlignment.CENTER);

  // ── TODAY label ────────────────────────────────────────────────────────────
  var todayLabel = slide.insertShape(SlidesApp.ShapeType.RECTANGLE, 32, 98, 52, 118);
  todayLabel.getFill().setSolidFill("#e87820");
  todayLabel.getBorder().setTransparent();
  var tlt = todayLabel.getText();
  tlt.setText("TO-\nDAY");
  tlt.getTextStyle().setFontSize(10).setBold(true).setForegroundColor("#FFFFFF");
  tlt.getParagraphStyle().setParagraphAlignment(SlidesApp.ParagraphAlignment.CENTER);

  // ── TODAY content box ──────────────────────────────────────────────────────
  var todayBox = slide.insertShape(SlidesApp.ShapeType.RECTANGLE, 86, 98, 602, 118);
  todayBox.getFill().setSolidFill("#fff8f0");
  todayBox.getBorder().setWeight(2).setDashStyle(SlidesApp.DashStyle.SOLID);
  todayBox.getBorder().getLineFill().setSolidFill("#e87820");

  // TODAY headline
  var todayHead = slide.insertTextBox("⚠  Reality: fragmented, merchant-hostile, internally duplicated");
  todayHead.setLeft(94).setTop(103).setWidth(580).setHeight(18);
  var ths = todayHead.getText().getTextStyle();
  ths.setFontSize(10).setBold(true).setForegroundColor("#c0392b");

  // TODAY pain points — 4 mini cards in a 2×2 grid
  var pains = [
    { label: "COMPLETION RATE",   body: "85% incomplete on first send",       sub: "Re-work loops between DM, SE & merchant",          x: 94,  critical: true  },
    { label: "SYSTEM FRAGMENTATION", body: "2 disconnected systems",          sub: "DM navigates CKO tools; merchant sees broken UX",  x: 394, critical: true  },
    { label: "MERCHANT BURDEN",   body: "Heavy lift entirely on merchant",    sub: "No pre-fill, no guidance — just a blank form",      x: 94,  critical: false },
    { label: "INTERNAL COORD.",   body: "Siloed DM → SE handoffs",            sub: "Multiple voices; conflicting info to merchant",     x: 394, critical: false },
  ];

  pains.forEach(function(p, i) {
    var row = i < 2 ? 0 : 1;
    var y = 124 + row * 44;
    var card = slide.insertShape(SlidesApp.ShapeType.RECTANGLE, p.x, y, 288, 38);
    card.getFill().setSolidFill(p.critical ? "#fff5f5" : "#FFFFFF");
    card.getBorder().setWeight(1.5).getLineFill().setSolidFill(p.critical ? "#f5c6c6" : "#f0c0a0");

    var lbl = slide.insertTextBox(p.label);
    lbl.setLeft(p.x + 8).setTop(y + 4).setWidth(272).setHeight(10);
    lbl.getText().getTextStyle().setFontSize(7).setBold(true)
       .setForegroundColor(p.critical ? "#c0392b" : "#888888");

    var bdy = slide.insertTextBox(p.body);
    bdy.setLeft(p.x + 8).setTop(y + 14).setWidth(272).setHeight(12);
    bdy.getText().getTextStyle().setFontSize(9.5).setBold(true).setForegroundColor("#333333");

    var sub = slide.insertTextBox(p.sub);
    sub.setLeft(p.x + 8).setTop(y + 26).setWidth(272).setHeight(10);
    sub.getText().getTextStyle().setFontSize(7.5).setForegroundColor("#888888");
  });

  // ── PROPOSED label ─────────────────────────────────────────────────────────
  var propLabel = slide.insertShape(SlidesApp.ShapeType.RECTANGLE, 32, 228, 52, 148);
  propLabel.getFill().setSolidFill("#1a5fb4");
  propLabel.getBorder().setTransparent();
  var plt = propLabel.getText();
  plt.setText("PRO-\nPOSED");
  plt.getTextStyle().setFontSize(9).setBold(true).setForegroundColor("#FFFFFF");
  plt.getParagraphStyle().setParagraphAlignment(SlidesApp.ParagraphAlignment.CENTER);

  // ── PROPOSED content box ───────────────────────────────────────────────────
  var propBox = slide.insertShape(SlidesApp.ShapeType.RECTANGLE, 86, 228, 602, 148);
  propBox.getFill().setSolidFill("#eef4ff");
  propBox.getBorder().setWeight(2).setDashStyle(SlidesApp.DashStyle.SOLID);
  propBox.getBorder().getLineFill().setSolidFill("#1a5fb4");

  // PROPOSED headline
  var propHead = slide.insertTextBox("✦  AI-first MAF: one hub, merchant shielded, one team behind it");
  propHead.setLeft(94).setTop(233).setWidth(580).setHeight(18);
  var phs = propHead.getText().getTextStyle();
  phs.setFontSize(10).setBold(true).setForegroundColor("#1a5fb4");

  // Three pillars
  var pillars = [
    { icon: "🤖", name: "AI-FIRST",           color: "#1a5fb4", borderTop: "#1a5fb4",
      desc: "DM+AI pre-fills from Salesforce & deal context. Merchant only attests — no blank form." },
    { icon: "🛡️", name: "MERCHANT PROTECTED", color: "#c07a00", borderTop: "#f0a500",
      desc: "Our systems & tool-switching are invisible to merchant. One clean hub is all they see." },
    { icon: "🤝", name: "#ONETEAM",           color: "#1e7a3a", borderTop: "#2d9e4f",
      desc: "DM & SE share one view, one timeline. One coordinated voice to the merchant." },
  ];

  pillars.forEach(function(p, i) {
    var px = 94 + i * 196;
    var card = slide.insertShape(SlidesApp.ShapeType.RECTANGLE, px, 256, 184, 68);
    card.getFill().setSolidFill("#FFFFFF");
    card.getBorder().setWeight(1.5).getLineFill().setSolidFill("#b3d0f5");

    // top accent line
    var accent = slide.insertShape(SlidesApp.ShapeType.RECTANGLE, px, 256, 184, 4);
    accent.getFill().setSolidFill(p.borderTop);
    accent.getBorder().setTransparent();

    var icon = slide.insertTextBox(p.icon + "  " + p.name);
    icon.setLeft(px + 6).setTop(264).setWidth(172).setHeight(12);
    var its = icon.getText().getTextStyle();
    its.setFontSize(8.5).setBold(true).setForegroundColor(p.color);

    var desc = slide.insertTextBox(p.desc);
    desc.setLeft(px + 6).setTop(278).setWidth(172).setHeight(40);
    var dts = desc.getText().getTextStyle();
    dts.setFontSize(8).setForegroundColor("#444444");
  });

  // "What changes" bar
  var wcBar = slide.insertShape(SlidesApp.ShapeType.RECTANGLE, 94, 330, 580, 38);
  wcBar.getFill().setSolidFill("#FFFFFF");
  wcBar.getBorder().setWeight(1).getLineFill().setSolidFill("#b3d0f5");

  var wcTitle = slide.insertTextBox("WHAT CHANGES IN PRACTICE");
  wcTitle.setLeft(100).setTop(333).setWidth(200).setHeight(10);
  wcTitle.getText().getTextStyle().setFontSize(7).setBold(true).setForegroundColor("#1a5fb4");

  var changes = [
    "→ AI drafts MAF from SF before DM sends",
    "→ Single hub replaces 2 systems",
    "→ Merchant attests only — no data entry",
    "→ AI quality check before submission",
    "→ DM & SE aligned on one view",
    "→ Sent globally at deal kickoff",
  ];
  var col1 = changes.slice(0, 3).join("\n");
  var col2 = changes.slice(3).join("\n");

  var c1 = slide.insertTextBox(col1);
  c1.setLeft(100).setTop(343).setWidth(280).setHeight(22);
  c1.getText().getTextStyle().setFontSize(7.5).setForegroundColor("#333333");

  var c2 = slide.insertTextBox(col2);
  c2.setLeft(390).setTop(343).setWidth(280).setHeight(22);
  c2.getText().getTextStyle().setFontSize(7.5).setForegroundColor("#333333");

  // ── Done ───────────────────────────────────────────────────────────────────
  var url = pres.getUrl();
  SpreadsheetApp.getUi().alert(
    "✅ Slide created!\n\n" +
    "Open your presentation:\n" + url + "\n\n" +
    "Tip: Rename & move it into your Journey deck, then delete slide 4."
  );
}
