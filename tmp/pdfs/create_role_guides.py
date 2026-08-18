from pathlib import Path

from reportlab.lib.colors import HexColor, white
from reportlab.lib.pagesizes import letter
from reportlab.lib.utils import ImageReader
from reportlab.pdfgen import canvas
from reportlab.pdfbase.pdfmetrics import stringWidth


ROOT = Path(__file__).resolve().parents[2]
OUT = ROOT / "output" / "pdf"
LOGO = ROOT / "public" / "logo-draft-law18referee-management-v4.png"

NAVY = HexColor("#224F7D")
NAVY_DARK = HexColor("#173A5E")
PINK = HexColor("#CC2F6F")
PINK_LIGHT = HexColor("#FCEBF2")
GREEN = HexColor("#2E8B70")
INK = HexColor("#17324E")
MUTED = HexColor("#617389")
LINE = HexColor("#D9E3EC")
PAPER = HexColor("#F5F8FB")


GUIDES = {
    "Referee-Coach": {
        "role": "REFEREE COACH",
        "subtitle": "View your coaching schedule, evaluate full crews, and review permitted rating history.",
        "steps": [
            ("Open Your Schedule", "Choose the event you are coaching, then open Schedule. Games and crews appear within the scope assigned to you."),
            ("Find the Right Game", "Use schedule filters for date, field, site, time, or competition. Select Rate Crew on the game you observed."),
            ("Rate the Full Crew", "Complete the event's Basic Eval or Skills Eval for every listed official. Use N/A when a score is not appropriate."),
            ("Save or Submit", "Save Crew Draft keeps unfinished work private to you. Submit All Ratings completes the evaluation for that game."),
            ("Review History", "Open Ratings to review evaluations you submitted and any additional history allowed by your event permissions."),
        ],
    },
    "Referee": {
        "role": "REFEREE",
        "subtitle": "See every Law18Ref assignment, check in on event day, and review evaluations shared with you.",
        "steps": [
            ("Start at Dashboard", "Your Dashboard lists linked groups and events. Referees do not need to keep a group or event selected as active."),
            ("View My Assignments", "Open My Assignments for one list of all Law18Ref games. Use filters for dates, groups, events, or connected calendars."),
            ("Check In", "When an assigned event requires check-in, open Check-In, tap Scan QR Code, and scan the code displayed by event staff."),
            ("Review My Evals", "Open My Evals to read public ratings shared with you. A notification badge appears for a new or updated evaluation."),
            ("Update Account Info", "Open your initials menu, then Account Settings, to maintain required contact details and personal calendar feeds."),
        ],
    },
    "Site-Supervisor": {
        "role": "SITE SUPERVISOR",
        "subtitle": "Monitor a site, manage arrivals, review staffing, and respond to event-day changes.",
        "steps": [
            ("Select the Event", "Use the workspace selectors to open today's group and event. Your access is limited to the dates and sites assigned to you."),
            ("Review Staffing", "Open Assignment Board or Schedule. Filter by venue, and group the schedule by field or time. HQ entries remain visible."),
            ("Manage Check-In", "Open Check-In to monitor arrivals, filter by status or field, and manually check an official in or undo a check-in."),
            ("Open Official Details", "Select an official's name to view their full event schedule and contact details, including games outside your managed site."),
            ("Handle Changes", "Orange schedule markers indicate unconfirmed changes. Edit Assignments only when that permission was enabled for you."),
        ],
    },
    "Event-Admin": {
        "role": "EVENT ADMIN",
        "subtitle": "Configure assigned events, control event access, and oversee schedules, check-in, coaching, and ratings.",
        "steps": [
            ("Open Your Event", "Choose the group and an event where you are listed as Event Admin. Your event tools appear in the main navigation."),
            ("Configure the Event", "Open Event Settings to manage event details, enabled features, check-in options, ratings configuration, and documents."),
            ("Manage People and Access", "Open Officials, edit a person, and use Event Access to assign event roles, dates, sites, games, and tool permissions."),
            ("Build the Schedule", "Create an event without games or use Import for an Assignr schedule. Use Schedule to filter, export, add games, or correct crews."),
            ("Run Event Operations", "Use Assignment Board, Check-In, Coaching, and Ratings. Confirm orange schedule changes after outside records are updated."),
        ],
    },
    "Group-Admin": {
        "role": "GROUP ADMIN",
        "subtitle": "Manage group members, events, permissions, records, and day-to-day operations across the group.",
        "steps": [
            ("Open the Group", "Use the workspace selector to choose the group you administer, then select an event when a tool needs event context."),
            ("Manage Officials", "Open Officials to add, import, export, edit, merge, archive, or remove members. Use Event Access for event-specific roles."),
            ("Manage Events", "Create events, import schedules, configure settings and documents, archive completed events, or restore archived events."),
            ("Oversee Operations", "Use Schedule, Assignment Board, Check-In, and Coaching to monitor staffing and make authorized event-day corrections."),
            ("Review Ratings and Activity", "Configure rating tools, filter or export history, approve public ratings when required, and review the Activity audit log."),
        ],
    },
}


def rounded(c, x, y, w, h, fill=white, stroke=LINE, radius=12, width=1):
    c.setLineWidth(width)
    c.setStrokeColor(stroke)
    c.setFillColor(fill)
    c.roundRect(x, y, w, h, radius, fill=1, stroke=1)


def wrap_lines(text, font, size, max_width):
    lines, current = [], ""
    for word in text.split():
        trial = f"{current} {word}".strip()
        if stringWidth(trial, font, size) <= max_width:
            current = trial
        else:
            if current:
                lines.append(current)
            current = word
    if current:
        lines.append(current)
    return lines


def draw_wrapped(c, text, x, y, width, size=8.6, leading=11, color=MUTED, font="Helvetica", max_lines=6):
    lines = wrap_lines(text, font, size, width)[:max_lines]
    c.setFont(font, size)
    c.setFillColor(color)
    for index, line in enumerate(lines):
        c.drawString(x, y - index * leading, line)
    return y - len(lines) * leading


def number(c, value, x, y):
    c.setFillColor(PINK)
    c.circle(x, y, 11, fill=1, stroke=0)
    c.setFillColor(white)
    c.setFont("Helvetica-Bold", 10)
    c.drawCentredString(x, y - 3.5, str(value))


def draw_sign_in(c, x, y, w, h):
    rounded(c, x, y, w, h, fill=NAVY_DARK, stroke=NAVY_DARK)
    number(c, 1, x + 23, y + h - 23)
    c.setFillColor(white)
    c.setFont("Helvetica-Bold", 14)
    c.drawString(x + 43, y + h - 28, "Sign In or Create Your Account")

    inner_y = y + 17
    inner_h = h - 57
    inner_w = (w - 52) / 2
    for offset, title, text in [
        (0, "ALREADY HAVE AN ACCOUNT", "Go to law18ref.com. Enter your primary email and password, then select Sign In. Use Set or reset your password if needed."),
        (inner_w + 12, "NEW TO LAW18REF", "Select New referee? Create an account. Enter your full name, the exact primary email your admin has on file, and a password of at least 8 characters."),
    ]:
        bx = x + 20 + offset
        c.setFillColor(HexColor("#244D73"))
        c.roundRect(bx, inner_y, inner_w, inner_h, 8, fill=1, stroke=0)
        c.setFillColor(HexColor("#F2B6CF"))
        c.setFont("Helvetica-Bold", 7.2)
        c.drawString(bx + 11, inner_y + inner_h - 17, title)
        draw_wrapped(c, text, bx + 11, inner_y + inner_h - 34, inner_w - 22, size=7.8, leading=9.4, color=white, max_lines=5)

    c.setFillColor(PINK_LIGHT)
    c.roundRect(x + 20, y - 26, w - 40, 20, 6, fill=1, stroke=0)
    c.setFillColor(INK)
    c.setFont("Helvetica-Bold", 7.5)
    c.drawCentredString(x + w / 2, y - 19, "If an admin already created your official record, using the same primary email links your new login to that existing record.")


def draw_step(c, n, title, text, x, y, w, h):
    rounded(c, x, y, w, h)
    number(c, n, x + 23, y + h - 23)
    c.setFillColor(INK)
    c.setFont("Helvetica-Bold", 12.2)
    c.drawString(x + 43, y + h - 28, title)
    draw_wrapped(c, text, x + 18, y + h - 51, w - 36, size=8.2, leading=10.4, max_lines=5)


def create_guide(slug, guide):
    path = OUT / f"Law18Ref-{slug}-Quick-Guide.pdf"
    c = canvas.Canvas(str(path), pagesize=letter)
    W, H = letter
    c.setTitle(f"Law18Ref {guide['role'].title()} Quick Guide")
    c.setAuthor("Law18Ref by FalkSports")
    c.setFillColor(PAPER)
    c.rect(0, 0, W, H, fill=1, stroke=0)

    c.setFillColor(white)
    c.rect(0, H - 105, W, 105, fill=1, stroke=0)
    if LOGO.exists():
        img = ImageReader(str(LOGO))
        iw, ih = img.getSize()
        target_h = 39
        c.drawImage(img, 34, H - 60, width=target_h * iw / ih, height=target_h, mask="auto", preserveAspectRatio=True)
    c.setFillColor(NAVY_DARK)
    c.setFont("Helvetica-Bold", 20)
    c.drawString(34, H - 83, f"{guide['role']} QUICK GUIDE")
    c.setFillColor(MUTED)
    c.setFont("Helvetica", 8.5)
    c.drawString(34, H - 99, guide["subtitle"])

    left = 34
    full_w = W - 68
    sign_y = H - 274
    draw_sign_in(c, left, sign_y, full_w, 142)

    card_gap = 12
    card_w = (full_w - card_gap) / 2
    card_h = 95
    top_row_y = sign_y - 143
    steps = guide["steps"]
    draw_step(c, 2, steps[0][0], steps[0][1], left, top_row_y, card_w, card_h)
    draw_step(c, 3, steps[1][0], steps[1][1], left + card_w + card_gap, top_row_y, card_w, card_h)
    second_row_y = top_row_y - card_h - 12
    draw_step(c, 4, steps[2][0], steps[2][1], left, second_row_y, card_w, card_h)
    draw_step(c, 5, steps[3][0], steps[3][1], left + card_w + card_gap, second_row_y, card_w, card_h)

    final_y = second_row_y - 83
    rounded(c, left, final_y, full_w, 71, fill=PINK_LIGHT, stroke=HexColor("#F1B8D0"))
    number(c, 6, left + 23, final_y + 48)
    c.setFillColor(INK)
    c.setFont("Helvetica-Bold", 11.5)
    c.drawString(left + 43, final_y + 44, steps[4][0])
    draw_wrapped(c, steps[4][1], left + 43, final_y + 27, full_w - 66, size=8.2, leading=10, color=INK, max_lines=2)

    footer_y = 25
    c.setFillColor(NAVY_DARK)
    c.roundRect(left, footer_y, full_w, 42, 10, fill=1, stroke=0)
    c.setFillColor(white)
    c.setFont("Helvetica-Bold", 9)
    c.drawString(left + 15, footer_y + 25, "NEED HELP?")
    c.setFont("Helvetica", 7.8)
    c.drawString(left + 15, footer_y + 12, "Tap the ? button for role-specific navigation guidance, or contact your administrator.")
    c.setFillColor(PINK)
    c.circle(W - 54, footer_y + 21, 13, fill=1, stroke=0)
    c.setFillColor(white)
    c.setFont("Helvetica-Bold", 13)
    c.drawCentredString(W - 54, footer_y + 16.5, "?")
    c.setFillColor(MUTED)
    c.setFont("Helvetica", 6.2)
    c.drawRightString(W - 34, 13, "Law18Referee Management | by FalkSports")
    c.save()
    return path


def main():
    OUT.mkdir(parents=True, exist_ok=True)
    for slug, guide in GUIDES.items():
        create_guide(slug, guide)


if __name__ == "__main__":
    main()
