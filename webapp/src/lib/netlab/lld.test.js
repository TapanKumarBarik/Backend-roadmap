import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { LLD_PRESETS } from '../../config/lldstudio.js';
import {
  renderSvgDiagram,
  generatePythonCode,
  generateTypeScriptCode,
  generateGoCode,
  generateSqlDdl,
  generateMermaid
} from './lld.js';

describe('LLD & Database Schema Studio Logic', () => {
  it('renders SVG for Class Diagram with nodes, headers and relationship lines', () => {
    const svg = renderSvgDiagram(LLD_PRESETS.parkingLot);
    assert.match(svg, /<svg/);
    assert.match(svg, /Vehicle/);
    assert.match(svg, /ParkingSpot/);
    assert.match(svg, /class="lld-rel"/);
    assert.match(svg, /class="lld-node"/);
    assert.match(svg, /arrow-inherit/);
  });

  it('renders SVG for ER Diagram with table columns, PK and FK markers', () => {
    const svg = renderSvgDiagram(LLD_PRESETS.socialEr);
    assert.match(svg, /<svg/);
    assert.match(svg, /users/);
    assert.match(svg, /posts/);
    assert.match(svg, /PK/);
    assert.match(svg, /FK/);
  });

  it('generates idiomatic Python dataclasses and abstract classes', () => {
    const code = generatePythonCode(LLD_PRESETS.parkingLot);
    assert.match(code, /class Vehicle\(ABC\):/);
    assert.match(code, /@dataclass/);
    assert.match(code, /class Car\(Vehicle\):/);
    assert.match(code, /class IPricingStrategy\(ABC\):/);
    assert.match(code, /@abstractmethod/);
  });

  it('generates TypeScript interfaces and class implementations', () => {
    const code = generateTypeScriptCode(LLD_PRESETS.parkingLot);
    assert.match(code, /export interface IPricingStrategy/);
    assert.match(code, /export class Car extends Vehicle/);
    assert.match(code, /export class HourlyPricing implements IPricingStrategy/);
  });

  it('generates valid Go structs and interfaces', () => {
    const code = generateGoCode(LLD_PRESETS.parkingLot);
    assert.match(code, /package lld/);
    assert.match(code, /type Vehicle struct/);
    assert.match(code, /type IPricingStrategy interface/);
  });

  it('generates PostgreSQL DDL schemas with primary and foreign key constraints', () => {
    const ddl = generateSqlDdl(LLD_PRESETS.socialEr);
    assert.match(ddl, /CREATE TABLE users/);
    assert.match(ddl, /id BIGSERIAL PRIMARY KEY/);
    assert.match(ddl, /CREATE TABLE posts/);
    assert.match(ddl, /FOREIGN KEY \(author_id\) REFERENCES users\(id\)/);
  });

  it('generates valid Mermaid classDiagram and erDiagram strings', () => {
    const mermaidClass = generateMermaid(LLD_PRESETS.parkingLot);
    assert.match(mermaidClass, /^classDiagram/);
    assert.match(mermaidClass, /Vehicle/);
    assert.match(mermaidClass, /Car --\|> Vehicle/);

    const mermaidEr = generateMermaid(LLD_PRESETS.socialEr);
    assert.match(mermaidEr, /^erDiagram/);
    assert.match(mermaidEr, /users \{/);
  });
});
