import pypdf
import os

base = r'C:\work-learn\Backend-roadmap\webapp\public\notes\system-design'
out = r'C:\work-learn\Backend-roadmap\_tmp_pdf_extract'
os.makedirs(out, exist_ok=True)

for name in ['SD-N-004','SD-N-005','SD-N-006','SD-N-007','SD-N-008','SD-N-009']:
    path = os.path.join(base, name + '.pdf')
    reader = pypdf.PdfReader(path)
    texts = []
    for i, page in enumerate(reader.pages):
        t = page.extract_text() or ''
        texts.append(f'=== Page {i+1} ===\n{t}')
    full = '\n\n'.join(texts)
    with open(os.path.join(out, name + '.txt'), 'w', encoding='utf-8') as f:
        f.write(full)
    print(name, 'pages', len(reader.pages), 'chars', len(full))
