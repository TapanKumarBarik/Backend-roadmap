// Pure logic and generators for the LLD & Database Schema Studio (/tools/lld-studio/).
// Renders SVG Class/ER diagrams and translates structural models into Python, TypeScript, Go, SQL DDL, and Mermaid.

/** Escape XML characters for safe SVG text nodes */
export function escapeXml(str) {
  return String(str || '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&apos;');
}

/** Render a complete SVG string representing a Class Diagram or ER Model */
export function renderSvgDiagram(preset, options = {}) {
  const isEr = preset.mode === 'er';
  const width = options.width || 1040;
  const height = options.height || 480;

  const defs = `
    <defs>
      <!-- Inheritance / Implementation closed hollow triangle -->
      <marker id="arrow-inherit" viewBox="0 0 12 12" refX="11" refY="6" markerWidth="9" markerHeight="9" orient="auto-start-reverse">
        <polygon points="1 1, 11 6, 1 11" fill="var(--bg, #fff)" stroke="var(--fg-muted, #71717a)" stroke-width="1.5" />
      </marker>
      <!-- Association open arrow -->
      <marker id="arrow-assoc" viewBox="0 0 10 10" refX="9" refY="5" markerWidth="7" markerHeight="7" orient="auto-start-reverse">
        <polyline points="1 1, 9 5, 1 9" fill="none" stroke="var(--fg-muted, #71717a)" stroke-width="1.5" stroke-linecap="round" />
      </marker>
      <!-- Composition solid diamond -->
      <marker id="diamond-comp" viewBox="0 0 14 14" refX="13" refY="7" markerWidth="10" markerHeight="10" orient="auto">
        <polygon points="1 7, 7 1, 13 7, 7 13" fill="var(--fg, #09090b)" stroke="var(--border-strong, #3f3f46)" stroke-width="1.2" />
      </marker>
      <!-- Aggregation hollow diamond -->
      <marker id="diamond-aggr" viewBox="0 0 14 14" refX="13" refY="7" markerWidth="10" markerHeight="10" orient="auto">
        <polygon points="1 7, 7 1, 13 7, 7 13" fill="var(--bg, #fff)" stroke="var(--fg-muted, #71717a)" stroke-width="1.5" />
      </marker>
    </defs>
  `;

  const items = isEr ? preset.entities : preset.classes;
  const itemMap = new Map(items.map((it) => [it.id, it]));

  // Draw relationship connection lines
  let linesSvg = '';
  for (const rel of preset.relationships || []) {
    const fromNode = itemMap.get(rel.from);
    const toNode = itemMap.get(rel.to);
    if (!fromNode || !toNode) continue;

    const x1 = fromNode.x + fromNode.w / 2;
    const y1 = fromNode.y + fromNode.h / 2;
    const x2 = toNode.x + toNode.w / 2;
    const y2 = toNode.y + toNode.h / 2;

    let markerEnd = '';
    let strokeDash = '';
    if (rel.type === 'inheritance') {
      markerEnd = 'url(#arrow-inherit)';
    } else if (rel.type === 'implementation') {
      markerEnd = 'url(#arrow-inherit)';
      strokeDash = 'stroke-dasharray="4,4"';
    } else if (rel.type === 'composition') {
      markerEnd = 'url(#diamond-comp)';
    } else if (rel.type === 'aggregation') {
      markerEnd = 'url(#diamond-aggr)';
    } else if (rel.type === 'association' || rel.type === 'oneToMany') {
      markerEnd = 'url(#arrow-assoc)';
    }

    const midX = (x1 + x2) / 2;
    const midY = (y1 + y2) / 2;
    const labelSvg = rel.label ? `<text x="${midX}" y="${midY - 6}" font-size="10" fill="var(--fg-muted, #71717a)" text-anchor="middle" font-family="monospace">${escapeXml(rel.label)}</text>` : '';

    linesSvg += `
      <g class="lld-rel">
        <line x1="${x1}" y1="${y1}" x2="${x2}" y2="${y2}" stroke="var(--border-strong, #52525b)" stroke-width="1.4" ${strokeDash} marker-end="${markerEnd}" />
        ${labelSvg}
      </g>
    `;
  }

  // Draw class or entity boxes
  let boxesSvg = '';
  for (const it of items) {
    const isSelected = options.selectedId === it.id;
    const borderStroke = isSelected ? 'var(--accent, #3b82f6)' : 'var(--border-strong, #3f3f46)';
    const strokeWidth = isSelected ? '2.5' : '1.5';
    const headerBg = isEr ? 'var(--badge-accent-bg, rgba(59, 130, 246, 0.12))' : 'var(--bg-subtle, #f4f4f5)';

    let contentRowsSvg = '';
    let rowY = it.y + 42;

    if (isEr) {
      // ER Entity fields
      for (const field of it.fields || []) {
        const pkFk = field.isPk ? '🔑 PK' : (field.isFk ? '🔗 FK' : '');
        const pkFkColor = field.isPk ? 'var(--warn, #eab308)' : 'var(--signal, #06b6d4)';
        contentRowsSvg += `
          <g transform="translate(${it.x + 12}, ${rowY})">
            ${pkFk ? `<text x="0" y="0" font-size="9" font-weight="600" fill="${pkFkColor}">${pkFk}</text>` : ''}
            <text x="${pkFk ? 38 : 0}" y="0" font-size="11" fill="var(--fg, #09090b)" font-family="monospace">${escapeXml(field.name)}</text>
            <text x="${it.w - 24}" y="0" font-size="10" fill="var(--fg-muted, #71717a)" text-anchor="end" font-family="monospace">${escapeXml(field.type)}</text>
          </g>
        `;
        rowY += 18;
      }
    } else {
      // UML Class Fields
      for (const f of it.fields || []) {
        contentRowsSvg += `
          <text x="${it.x + 12}" y="${rowY}" font-size="10.5" fill="var(--fg, #09090b)" font-family="monospace">${escapeXml(f)}</text>
        `;
        rowY += 16;
      }
      if (it.methods && it.methods.length > 0) {
        // Divider before methods
        contentRowsSvg += `<line x1="${it.x}" y1="${rowY - 8}" x2="${it.x + it.w}" y2="${rowY - 8}" stroke="var(--border-subtle, #e4e4e7)" stroke-width="1" />`;
        rowY += 8;
        for (const m of it.methods) {
          contentRowsSvg += `
            <text x="${it.x + 12}" y="${rowY}" font-size="10.5" fill="var(--fg-muted, #71717a)" font-family="monospace">${escapeXml(m)}</text>
          `;
          rowY += 16;
        }
      }
    }

    const stereotypeSvg = it.stereotype ? `<text x="${it.x + it.w / 2}" y="${it.y + 14}" font-size="9" fill="var(--accent, #3b82f6)" text-anchor="middle" font-style="italic">&lt;&lt;${escapeXml(it.stereotype)}&gt;&gt;</text>` : '';
    const titleY = it.stereotype ? it.y + 28 : it.y + 22;

    boxesSvg += `
      <g class="lld-node${isSelected ? ' is-selected' : ''}" data-id="${escapeXml(it.id)}" data-selected="${isSelected ? 'true' : 'false'}" style="cursor: pointer;">
        <!-- Card Background -->
        <rect x="${it.x}" y="${it.y}" width="${it.w}" height="${it.h}" rx="6" fill="var(--bg, #ffffff)" stroke="${borderStroke}" stroke-width="${strokeWidth}" />
        <!-- Header Background -->
        <path d="M ${it.x} ${it.y + 6} A 6 6 0 0 1 ${it.x + 6} ${it.y} L ${it.x + it.w - 6} ${it.y} A 6 6 0 0 1 ${it.x + it.w} ${it.y + 6} L ${it.x + it.w} ${it.y + 32} L ${it.x} ${it.y + 32} Z" fill="${headerBg}" />
        <line x1="${it.x}" y1="${it.y + 32}" x2="${it.x + it.w}" y2="${it.y + 32}" stroke="var(--border, #d4d4d8)" stroke-width="1" />
        ${stereotypeSvg}
        <text x="${it.x + it.w / 2}" y="${titleY}" font-size="12" font-weight="600" fill="var(--fg, #09090b)" text-anchor="middle" font-family="system-ui, sans-serif">${escapeXml(it.name)}</text>
        ${contentRowsSvg}
      </g>
    `;
  }

  return `
    <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${width} ${height}" class="lld-canvas-svg" role="img" aria-label="${escapeXml(preset.name)} Diagram">
      ${defs}
      <rect width="100%" height="100%" fill="transparent" />
      <g class="lld-links">${linesSvg}</g>
      <g class="lld-nodes">${boxesSvg}</g>
    </svg>
  `.trim();
}

/** Translate model to Python dataclasses and abstract classes */
export function generatePythonCode(preset) {
  if (preset.mode === 'er') {
    // Generate SQLAlchemy / SQLModel ORM classes
    let code = 'from datetime import datetime\nfrom typing import Optional\nfrom sqlmodel import Field, SQLModel, Relationship\n\n';
    for (const ent of preset.entities) {
      const clsName = ent.name.charAt(0).toUpperCase() + ent.name.slice(1).replace(/_([a-z])/g, (_, l) => l.toUpperCase());
      code += `class ${clsName}(SQLModel, table=True):\n    __tablename__ = "${ent.name}"\n\n`;
      for (const f of ent.fields) {
        let pyType = 'str';
        if (f.type.includes('BIGSERIAL') || f.type.includes('SERIAL') || f.type.includes('INT')) pyType = 'int';
        else if (f.type.includes('TIMESTAMPTZ')) pyType = 'datetime';
        else if (f.type.includes('BOOLEAN')) pyType = 'bool';

        const fieldArgs = [];
        if (f.isPk) fieldArgs.push('primary_key=True');
        if (f.isUnique) fieldArgs.push('unique=True, index=True');
        if (f.isFk) fieldArgs.push(`foreign_key="${f.ref}"`);

        const argStr = fieldArgs.length > 0 ? `Field(${fieldArgs.join(', ')})` : 'None';
        code += `    ${f.name}: ${pyType} = ${argStr}\n`;
      }
      code += '\n';
    }
    return code.trim();
  }

  // Class diagram to Python dataclasses and ABC
  let code = 'from abc import ABC, abstractmethod\nfrom dataclasses import dataclass, field\nfrom datetime import datetime\nfrom typing import Optional, List\n\n';
  for (const cls of preset.classes) {
    if (cls.stereotype === 'interface' || cls.stereotype === 'abstract') {
      code += `class ${cls.name}(ABC):\n`;
      if (!cls.methods.length) {
        code += '    pass\n\n';
      } else {
        for (const m of cls.methods) {
          const sig = m.replace(/^[+-]\s*/, '').replace(/:\s*(\w+)/, ' -> $1');
          code += `    @abstractmethod\n    def ${sig}:\n        ...\n\n`;
        }
      }
    } else {
      const parent = cls.parent || cls.implements || '';
      const heritage = parent ? `(${parent})` : '';
      code += `@dataclass\nclass ${cls.name}${heritage}:\n`;
      for (const f of cls.fields) {
        const cleanF = f.replace(/^[+-]\s*/, '').replace(':', ': ');
        code += `    ${cleanF}\n`;
      }
      if (!cls.fields.length && !cls.methods.length) {
        code += '    pass\n';
      }
      for (const m of cls.methods) {
        if (m.startsWith('+ __init__')) continue;
        const sig = m.replace(/^[+-]\s*/, '');
        code += `\n    def ${sig}:\n        # Implementation logic\n        pass\n`;
      }
      code += '\n';
    }
  }
  return code.trim();
}

/** Translate model to TypeScript interfaces and classes */
export function generateTypeScriptCode(preset) {
  if (preset.mode === 'er') {
    let code = '// TypeScript Database Entity Types\n\n';
    for (const ent of preset.entities) {
      const typeName = ent.name.charAt(0).toUpperCase() + ent.name.slice(1).replace(/_([a-z])/g, (_, l) => l.toUpperCase());
      code += `export interface ${typeName} {\n`;
      for (const f of ent.fields) {
        let tsType = 'string';
        if (f.type.includes('SERIAL') || f.type.includes('INT')) tsType = 'number';
        else if (f.type.includes('TIMESTAMPTZ')) tsType = 'Date';
        else if (f.type.includes('BOOLEAN')) tsType = 'boolean';
        code += `  ${f.name}: ${tsType};\n`;
      }
      code += '}\n\n';
    }
    return code.trim();
  }

  let code = '// Low-Level Design Interfaces & Classes\n\n';
  for (const cls of preset.classes) {
    if (cls.stereotype === 'interface') {
      code += `export interface ${cls.name} {\n`;
      for (const m of cls.methods) {
        const cleanM = m.replace(/^[+-]\s*/, '');
        code += `  ${cleanM};\n`;
      }
      code += '}\n\n';
    } else {
      const heritage = cls.parent ? ` extends ${cls.parent}` : (cls.implements ? ` implements ${cls.implements}` : '');
      code += `export class ${cls.name}${heritage} {\n`;
      for (const f of cls.fields) {
        const priv = f.startsWith('-') ? 'private ' : 'public ';
        const clean = f.replace(/^[+-]\s*/, '');
        code += `  ${priv}${clean};\n`;
      }
      if (cls.fields.length) code += '\n';
      for (const m of cls.methods) {
        const cleanM = m.replace(/^[+-]\s*/, '');
        code += `  ${cleanM} {\n    // TODO: implement\n  }\n\n`;
      }
      code += '}\n\n';
    }
  }
  return code.trim();
}

/** Translate model to Go structs and interfaces */
export function generateGoCode(preset) {
  if (preset.mode === 'er') {
    let code = 'package models\n\nimport "time"\n\n';
    for (const ent of preset.entities) {
      const structName = ent.name.charAt(0).toUpperCase() + ent.name.slice(1).replace(/_([a-z])/g, (_, l) => l.toUpperCase());
      code += `type ${structName} struct {\n`;
      for (const f of ent.fields) {
        let goType = 'string';
        if (f.type.includes('BIGSERIAL') || f.type.includes('BIGINT')) goType = 'int64';
        else if (f.type.includes('SERIAL') || f.type.includes('INT')) goType = 'int';
        else if (f.type.includes('TIMESTAMPTZ')) goType = 'time.Time';
        else if (f.type.includes('BOOLEAN')) goType = 'bool';

        const fieldName = f.name.charAt(0).toUpperCase() + f.name.slice(1).replace(/_([a-z])/g, (_, l) => l.toUpperCase());
        code += `\t${fieldName} ${goType} \`db:"${f.name}" json:"${f.name}"\`\n`;
      }
      code += '}\n\n';
    }
    return code.trim();
  }

  let code = 'package lld\n\n';
  for (const cls of preset.classes) {
    if (cls.stereotype === 'interface') {
      code += `type ${cls.name} interface {\n`;
      for (const m of cls.methods) {
        const cleanM = m.replace(/^[+-]\s*/, '');
        code += `\t${cleanM}\n`;
      }
      code += '}\n\n';
    } else {
      code += `type ${cls.name} struct {\n`;
      if (cls.parent) code += `\t${cls.parent}\n`;
      for (const f of cls.fields) {
        const cleanF = f.replace(/^[+-]\s*/, '');
        code += `\t${cleanF}\n`;
      }
      code += '}\n\n';
    }
  }
  return code.trim();
}

/** Translate model to SQL DDL CREATE TABLE statements */
export function generateSqlDdl(preset) {
  if (preset.mode === 'er') {
    let sql = '-- PostgreSQL DDL Schema\n\n';
    for (const ent of preset.entities) {
      sql += `CREATE TABLE ${ent.name} (\n`;
      const colDefs = [];
      const fks = [];

      for (const f of ent.fields) {
        let def = `  ${f.name} ${f.type}`;
        if (f.isPk) def += ' PRIMARY KEY';
        if (f.isUnique) def += ' UNIQUE NOT NULL';
        if (f.isFk && f.ref) {
          const [refTable, refCol] = f.ref.split('.');
          fks.push(`  FOREIGN KEY (${f.name}) REFERENCES ${refTable}(${refCol}) ON DELETE CASCADE`);
        }
        colDefs.push(def);
      }

      sql += [...colDefs, ...fks].join(',\n');
      sql += '\n);\n\n';
    }
    return sql.trim();
  }

  return '-- SQL DDL is applicable to Entity-Relationship (ER) models. Switch to the Social Network ER preset to generate table schemas.';
}

/** Translate model to Mermaid markdown syntax */
export function generateMermaid(preset) {
  if (preset.mode === 'er') {
    let m = 'erDiagram\n';
    for (const ent of preset.entities) {
      m += `    ${ent.name} {\n`;
      for (const f of ent.fields) {
        const pk = f.isPk ? 'PK' : (f.isFk ? 'FK' : '');
        m += `        ${f.type} ${f.name} ${pk}\n`;
      }
      m += '    }\n';
    }
    for (const rel of preset.relationships || []) {
      m += `    ${rel.from} ||--o{ ${rel.to} : "references"\n`;
    }
    return m.trim();
  }

  let m = 'classDiagram\n';
  for (const cls of preset.classes) {
    if (cls.stereotype) m += `    class ${cls.name} {\n        <<${cls.stereotype}>>\n    }\n`;
    for (const f of cls.fields) {
      m += `    ${cls.name} : ${f}\n`;
    }
    for (const meth of cls.methods) {
      m += `    ${cls.name} : ${meth}\n`;
    }
  }
  for (const rel of preset.relationships || []) {
    let arrow = '-->';
    if (rel.type === 'inheritance') arrow = '--|>';
    else if (rel.type === 'implementation') arrow = '..|>';
    else if (rel.type === 'composition') arrow = '*--';
    else if (rel.type === 'aggregation') arrow = 'o--';
    m += `    ${rel.from} ${arrow} ${rel.to} : ${rel.label || ''}\n`;
  }
  return m.trim();
}
