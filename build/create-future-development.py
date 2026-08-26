"""Render the canonical owner roadmap; requires reportlab in the document runtime."""
from pathlib import Path
from xml.sax.saxutils import escape
from reportlab.platypus import SimpleDocTemplate, Paragraph, Spacer, PageBreak
from reportlab.lib.styles import getSampleStyleSheet, ParagraphStyle
from reportlab.lib.colors import HexColor
from reportlab.lib.enums import TA_LEFT

root = Path(__file__).resolve().parents[1]
target = root / 'output/pdf/Law18Ref_Future_Development_Plans.pdf'
target.parent.mkdir(parents=True, exist_ok=True)
styles = getSampleStyleSheet()
styles.add(ParagraphStyle(name='RoadTitle', fontName='Helvetica-Bold', fontSize=21, leading=25, textColor=HexColor('#24496f'), spaceAfter=10))
styles.add(ParagraphStyle(name='RoadSection', fontName='Helvetica-Bold', fontSize=12, leading=15, textColor=HexColor('#24496f'), spaceBefore=10, spaceAfter=5, keepWithNext=True))
styles.add(ParagraphStyle(name='RoadBody', fontName='Helvetica', fontSize=9, leading=12, spaceAfter=5, alignment=TA_LEFT))
styles.add(ParagraphStyle(name='RoadBullet', parent=styles['RoadBody'], leftIndent=10, firstLineIndent=-7))
story = []
for line in (root / 'docs/FUTURE_DEVELOPMENT.md').read_text().splitlines():
    if not line.strip():
        continue
    if line == '---':
        story.append(PageBreak())
    elif line.startswith('# '):
        story.append(Paragraph(escape(line[2:]), styles['RoadTitle']))
    elif line.startswith('## '):
        story.append(Paragraph(escape(line[3:]), styles['RoadTitle']))
    elif line.startswith('### '):
        story.append(Paragraph(escape(line[4:]), styles['RoadSection']))
    elif line.startswith('- '):
        story.append(Paragraph('- ' + escape(line[2:]), styles['RoadBullet']))
    else:
        story.append(Paragraph(escape(line), styles['RoadBody']))

def footer(canvas, doc):
    canvas.setStrokeColor(HexColor('#b82a66'))
    canvas.line(42, 36, 570, 36)
    canvas.setFillColor(HexColor('#667586'))
    canvas.setFont('Helvetica', 8)
    canvas.drawString(42, 23, 'Law18Ref | Owner planning document | No committed release dates')
    canvas.drawRightString(570, 23, str(doc.page))

SimpleDocTemplate(str(target), pagesize=(612, 792), rightMargin=42, leftMargin=42, topMargin=38, bottomMargin=48,
                  title='Law18Ref Future Development Plans', author='Law18Ref').build(story, onFirstPage=footer, onLaterPages=footer)
print(target)
