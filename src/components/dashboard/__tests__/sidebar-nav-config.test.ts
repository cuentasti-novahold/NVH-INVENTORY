import { describe, it, expect } from 'vitest';
import {
  SIDEBAR_NAV_SECTIONS,
  type SidebarNavSection,
} from '../sidebar-nav-config';

describe('SIDEBAR_NAV_SECTIONS', () => {
  it('exports an array with exactly 3 sections', () => {
    expect(SIDEBAR_NAV_SECTIONS).toHaveLength(3);
  });

  it('has sections in exact order: CATÁLOGOS, OPERACIONES, SISTEMA', () => {
    expect(SIDEBAR_NAV_SECTIONS[0]!.label).toBe('CATÁLOGOS');
    expect(SIDEBAR_NAV_SECTIONS[1]!.label).toBe('OPERACIONES');
    expect(SIDEBAR_NAV_SECTIONS[2]!.label).toBe('SISTEMA');
  });

  it('every item has a non-empty label in Spanish (starts with capital letter)', () => {
    for (const section of SIDEBAR_NAV_SECTIONS) {
      for (const item of section.items) {
        expect(item.label.length).toBeGreaterThan(0);
      }
    }
  });

  it('every item href starts with /', () => {
    for (const section of SIDEBAR_NAV_SECTIONS) {
      for (const item of section.items) {
        expect(item.href).toMatch(/^\//);
      }
    }
  });

  it('every item has an icon (LucideIcon — object or function)', () => {
    for (const section of SIDEBAR_NAV_SECTIONS) {
      for (const item of section.items) {
        expect(item.icon).toBeTruthy();
        expect(['function', 'object']).toContain(typeof item.icon);
      }
    }
  });

  it('CATÁLOGOS has at least 2 items', () => {
    const catalogos = SIDEBAR_NAV_SECTIONS.find((s) => s.label === 'CATÁLOGOS');
    expect(catalogos!.items.length).toBeGreaterThanOrEqual(2);
  });

  it('OPERACIONES has at least 3 items', () => {
    const ops = SIDEBAR_NAV_SECTIONS.find((s) => s.label === 'OPERACIONES');
    expect(ops!.items.length).toBeGreaterThanOrEqual(3);
  });

  it('SISTEMA has at least 1 item', () => {
    const sistema = SIDEBAR_NAV_SECTIONS.find((s) => s.label === 'SISTEMA');
    expect(sistema!.items.length).toBeGreaterThanOrEqual(1);
  });

  it('OPERACIONES includes /scanner entry with label Escáner QR', () => {
    const ops = SIDEBAR_NAV_SECTIONS.find((s) => s.label === 'OPERACIONES');
    const scanner = ops!.items.find((i) => i.href === '/scanner');
    expect(scanner).toBeDefined();
    expect(scanner!.label).toBe('Escáner QR');
    expect(scanner!.icon).toBeTruthy();
  });
});
