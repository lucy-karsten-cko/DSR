from pptx import Presentation
from pptx.util import Inches, Pt, Emu
from pptx.dml.color import RGBColor
from pptx.enum.text import PP_ALIGN
from pptx.util import Inches, Pt

# ── helpers ──────────────────────────────────────────────────────────────────

def rgb(h):
    h = h.lstrip("#")
    return RGBColor(int(h[0:2],16), int(h[2:4],16), int(h[4:6],16))

def box(slide, x, y, w, h, fill=None, line=None, line_w=Pt(1.5)):
    from pptx.util import Emu
    from pptx.enum.shapes import MSO_SHAPE_TYPE
    shape = slide.shapes.add_shape(1, x, y, w, h)   # MSO_SHAPE_TYPE.RECTANGLE = 1
    shape.line.fill.background()
    if fill:
        shape.fill.solid()
        shape.fill.fore_color.rgb = rgb(fill)
    else:
        shape.fill.background()
    if line:
        shape.line.color.rgb = rgb(line)
        shape.line.width = line_w
    else:
        shape.line.fill.background()
    return shape

def textbox(slide, text, x, y, w, h, size=11, bold=False, color="#222222",
            align=PP_ALIGN.LEFT, wrap=True):
    txb = slide.shapes.add_textbox(x, y, w, h)
    txb.word_wrap = wrap
    tf = txb.text_frame
    tf.word_wrap = wrap
    p = tf.paragraphs[0]
    p.alignment = align
    run = p.add_run()
    run.text = text
    run.font.size = Pt(size)
    run.font.bold = bold
    run.font.color.rgb = rgb(color)
    return txb

def label_box(slide, text, x, y, w, h, bg, fg="#FFFFFF", size=11):
    s = box(slide, x, y, w, h, fill=bg)
    tf = s.text_frame
    tf.word_wrap = True
    p = tf.paragraphs[0]
    p.alignment = PP_ALIGN.CENTER
    run = p.add_run()
    run.text = text
    run.font.size = Pt(size)
    run.font.bold = True
    run.font.color.rgb = rgb(fg)
    return s

def card(slide, x, y, w, h, label, label_color, body, sub,
         fill="#FFFFFF", border="#f0c0a0", accent="#e87820"):
    # card background
    c = box(slide, x, y, w, h, fill=fill, line=border, line_w=Pt(1.5))
    # left accent bar
    box(slide, x, y, Inches(0.06), h, fill=accent)
    # label
    textbox(slide, label, x+Inches(0.1), y+Inches(0.06), w-Inches(0.15), Inches(0.18),
            size=7, bold=True, color=label_color)
    # body
    textbox(slide, body, x+Inches(0.1), y+Inches(0.24), w-Inches(0.15), Inches(0.22),
            size=11, bold=True, color="#222222")
    # sub
    textbox(slide, sub, x+Inches(0.1), y+Inches(0.46), w-Inches(0.15), Inches(0.22),
            size=8.5, color="#888888")

def pillar(slide, x, y, w, h, icon_name, name, name_color, accent_color, desc):
    box(slide, x, y, w, h, fill="#FFFFFF", line="#b3d0f5", line_w=Pt(1.5))
    # top accent bar
    box(slide, x, y, w, Inches(0.06), fill=accent_color)
    # name
    textbox(slide, icon_name + "  " + name, x+Inches(0.1), y+Inches(0.1),
            w-Inches(0.2), Inches(0.22), size=9, bold=True, color=name_color)
    # desc
    textbox(slide, desc, x+Inches(0.1), y+Inches(0.32), w-Inches(0.2),
            h-Inches(0.4), size=9, color="#444444")

# ── Build slide ───────────────────────────────────────────────────────────────

prs = Presentation()
prs.slide_width  = Inches(13.33)
prs.slide_height = Inches(7.5)

slide = prs.slides.add_slide(prs.slide_layouts[6])  # blank
slide.background.fill.solid()
slide.background.fill.fore_color.rgb = rgb("#FFFFFF")

M  = Inches(0.35)          # margin
W  = Inches(13.33) - M*2   # content width
LW = Inches(0.85)          # row-label width
CW = W - LW                # content width after label

# ── TITLE ────────────────────────────────────────────────────────────────────
textbox(slide, "Journey today + proposed journey",
        M, Inches(0.18), W, Inches(0.4),
        size=22, bold=True, color="#1a1a2e")

# Step badge
b = box(slide, M, Inches(0.62), Inches(1.4), Inches(0.28), fill="#1a1a2e")
tf = b.text_frame; p = tf.paragraphs[0]; p.alignment = PP_ALIGN.CENTER
r = p.add_run(); r.text = "STEP  4  ·  MAF"
r.font.size = Pt(9); r.font.bold = True; r.font.color.rgb = rgb("#FFFFFF")

# Context note
box(slide, M+Inches(1.55), Inches(0.62), W-Inches(1.55), Inches(0.28), fill="#f5f5f5", line="#cccccc")
box(slide, M+Inches(1.55), Inches(0.62), Inches(0.05), Inches(0.28), fill="#cccccc")
textbox(slide, "Where it sits: DM has sent the MAF link. Merchant must now complete the form — highest-friction point in the journey.",
        M+Inches(1.7), Inches(0.63), W-Inches(1.75), Inches(0.26),
        size=9, color="#555555")

# ── TODAY ROW ─────────────────────────────────────────────────────────────────
TY = Inches(1.02)
TH = Inches(2.7)

label_box(slide, "TO-\nDAY", M, TY, LW, TH, bg="#e87820", size=12)
box(slide, M+LW, TY, CW, TH, fill="#fff8f0", line="#e87820", line_w=Pt(2))

# TODAY headline
box(slide, M+LW, TY, CW, Inches(0.32), fill="#fff0e0")
textbox(slide, u"⚠  Reality: fragmented, merchant-hostile, internally duplicated",
        M+LW+Inches(0.15), TY+Inches(0.05), CW-Inches(0.3), Inches(0.25),
        size=11, bold=True, color="#c0392b")
# "HIGH FRICTION" pill
b2 = box(slide, M+LW+CW-Inches(1.4), TY+Inches(0.06), Inches(1.25), Inches(0.2), fill="#c0392b")
tf2 = b2.text_frame; p2 = tf2.paragraphs[0]; p2.alignment = PP_ALIGN.CENTER
r2 = p2.add_run(); r2.text = "HIGH FRICTION"
r2.font.size = Pt(7); r2.font.bold = True; r2.font.color.rgb = rgb("#FFFFFF")

# 4 pain cards — 2x2
PY = TY + Inches(0.38)
PH = Inches(1.1)
PW = (CW - Inches(0.5)) / 2
PX1 = M + LW + Inches(0.15)
PX2 = PX1 + PW + Inches(0.2)

card(slide, PX1, PY,        PW, PH, "COMPLETION RATE",     "#c0392b",
     "85% incomplete on first send",
     "Re-work loops between DM, SE & merchant — everyone loses time",
     fill="#fff5f5", border="#f5c6c6", accent="#c0392b")

card(slide, PX2, PY,        PW, PH, "SYSTEM FRAGMENTATION","#c0392b",
     "2 disconnected systems",
     "DM navigates internal tools; merchant sees a broken experience",
     fill="#fff5f5", border="#f5c6c6", accent="#c0392b")

card(slide, PX1, PY+PH+Inches(0.1), PW, PH, "MERCHANT BURDEN", "#888888",
     "Heavy lift entirely on merchant",
     "No pre-fill, no guidance — handed a blank form with no context",
     fill="#FFFFFF", border="#f0c0a0", accent="#e87820")

card(slide, PX2, PY+PH+Inches(0.1), PW, PH, "INTERNAL COORD.", "#888888",
     "Siloed DM → SE handoffs",
     "Multiple voices, conflicting info — merchant doesn't know who owns this",
     fill="#FFFFFF", border="#f0c0a0", accent="#e87820")

# ── PROPOSED ROW ──────────────────────────────────────────────────────────────
PY2 = TY + TH + Inches(0.12)
PH2 = Inches(7.5) - PY2 - Inches(0.2)

label_box(slide, "PRO-\nPOSED", M, PY2, LW, PH2, bg="#1a5fb4", size=11)
box(slide, M+LW, PY2, CW, PH2, fill="#eef4ff", line="#1a5fb4", line_w=Pt(2))

# PROPOSED headline
box(slide, M+LW, PY2, CW, Inches(0.32), fill="#dde8fa")
textbox(slide, u"✶  AI-first MAF: one hub, merchant shielded, one team behind it",
        M+LW+Inches(0.15), PY2+Inches(0.05), CW-Inches(0.3), Inches(0.25),
        size=11, bold=True, color="#1a5fb4")
b3 = box(slide, M+LW+CW-Inches(1.1), PY2+Inches(0.06), Inches(0.95), Inches(0.2), fill="#1a5fb4")
tf3 = b3.text_frame; p3 = tf3.paragraphs[0]; p3.alignment = PP_ALIGN.CENTER
r3 = p3.add_run(); r3.text = "AI-FIRST"
r3.font.size = Pt(7); r3.font.bold = True; r3.font.color.rgb = rgb("#FFFFFF")

# 3 pillars
PIY = PY2 + Inches(0.38)
PIH = Inches(1.35)
PIW = (CW - Inches(0.5)) / 3
PIX1 = M + LW + Inches(0.15)

pillar(slide, PIX1,               PIY, PIW, PIH, "\U0001F916", "AI-FIRST",
       "#1a5fb4", "#1a5fb4",
       "DM+AI pre-fills the MAF from Salesforce & deal context.\nMerchant only attests — no blank form, no data entry.")

pillar(slide, PIX1+PIW+Inches(0.1), PIY, PIW, PIH, "\U0001F6E1", "MERCHANT PROTECTED",
       "#b07800", "#f0a500",
       "Our internal systems & tool-switching are invisible to the merchant.\nOne clean hub is all they ever see.")

pillar(slide, PIX1+PIW*2+Inches(0.2), PIY, PIW, PIH, "\U0001F91D", "#ONETEAM",
       "#1e7a3a", "#2d9e4f",
       "DM & SE share one view, one timeline.\nOne coordinated voice to the merchant — no crossed wires.")

# "What changes" bar
WCY = PIY + PIH + Inches(0.1)
WCH = PY2 + PH2 - WCY - Inches(0.1)
box(slide, M+LW+Inches(0.15), WCY, CW-Inches(0.3), WCH, fill="#FFFFFF", line="#b3d0f5")
textbox(slide, "WHAT CHANGES IN PRACTICE",
        M+LW+Inches(0.25), WCY+Inches(0.07), Inches(2.5), Inches(0.2),
        size=7.5, bold=True, color="#1a5fb4")

changes = [
    ("AI drafts MAF from Salesforce before DM sends",   0),
    ("Single onboarding hub replaces 2 systems",        1),
    ("Merchant attests only — zero data entry",         2),
    ("AI quality check catches gaps before submission", 0),
    ("DM & SE aligned on one shared view & timeline",   1),
    ("Sent globally at deal kickoff, not as afterthought", 2),
]
col_w = (CW - Inches(0.6)) / 3
for text, col in changes:
    row = 1 if changes.index((text,col)) >= 3 else 0
    cx = M + LW + Inches(0.25) + col * col_w
    cy = WCY + Inches(0.27) + row * Inches(0.22)
    textbox(slide, u"→ " + text, cx, cy, col_w - Inches(0.1), Inches(0.2),
            size=9, color="#333333")

prs.save("/home/user/DSR/slide4_maf.pptx")
print("saved")
