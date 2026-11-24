import os
import re

lessons = [
  '04-ports-and-sockets',
  '05-protocols-and-layers',
  '06-osi-model',
  '07-what-happens-when-you-type-a-url',
  '08-tcp-sequence-numbers-and-acks',
  '09-tcp-three-way-handshake',
  '16-dns-records-ttl-and-migrations',
]
base = r'C:\work-learn\Backend-roadmap\content\system-design\02-networking-from-zero'
checks = [
  ('NOTE', '[!NOTE]'),
  ('TIP', '[!TIP]'),
  ('Reading Time', 'Estimated Reading Time'),
  ('What It Is table', 'What It Is vs'),
  ('Observability', 'Observability'),
  ('Math / formula', '$$'),
  ('Percentiles/p95', 'p95'),
  ('Compounding', '1 -'),
  ('Numbers engineer', 'Numbers Every'),
  ('mermaid', '```mermaid'),
  ('Budgets', 'Budget'),
  ('Mitigations', 'Mitigation'),
  ('War Story', 'War Story'),
  ('carousel', '```carousel'),
  ('slide', '<!-- slide -->'),
  ('Common Mistakes', 'Common Mistakes'),
  ('Glossary', 'Glossary'),
  ('details QAs', '<details>'),
  ('BASIC', '[BASIC]'),
  ('SCENARIO', '[SCENARIO]'),
  ('TRICKY', '[TRICKY]'),
  ('Cheat Sheet', 'Cheat Sheet'),
  ('CLI', '```bash'),
]
for slug in lessons:
  path = os.path.join(base, slug, 'README.md')
  with open(path, encoding='utf-8') as f:
    text = f.read()
  lines = text.count('\n') + 1
  qa_count = text.count('<details>')
  basic = len(re.findall(r'\[BASIC\]', text))
  scen = len(re.findall(r'\[SCENARIO\]', text))
  trick = len(re.findall(r'\[TRICKY\]', text))
  print(f'=== {slug} lines={lines} details={qa_count} B/S/T={basic}/{scen}/{trick} ===')
  missing = []
  for name, needle in checks:
    ok = needle in text
    if not ok:
      # softer alternates
      if name == 'Math / formula' and ('$' in text or 'equation' in text.lower()):
        ok = True
      if name == 'Percentiles/p95' and ('p99' in text or 'percentile' in text.lower() or 'p_95' in text or 'p_{95}' in text):
        ok = True
      if name == 'Compounding' and ('compound' in text.lower() or '1-' in text.replace(' ', '')):
        ok = True
      if name == 'Numbers engineer' and ('Numbers Every' in text or 'orders of magnitude' in text.lower() or 'Every Backend Engineer' in text):
        ok = True
      if name == 'Budgets' and ('budget' in text.lower() or 'capacity' in text.lower() or 'sizing' in text.lower()):
        ok = True
      if name == 'Mitigations' and ('mitigation' in text.lower() or 'Top Engineering' in text or 'How to Fix' in text):
        ok = True
      if name == 'Glossary' and ('Words You' in text or 'Key Terms' in text):
        ok = True
    status = 'YES' if ok else 'MISSING'
    if not ok:
      missing.append(name)
    print(f'  {status}: {name}')
  if missing:
    print(f'  >> MISSING: {missing}')
  else:
    print('  >> ALL CHECKS PASS')
