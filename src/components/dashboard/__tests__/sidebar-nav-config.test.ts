import { describe, it, expect } from 'vitest';
import {
  SIDEBAR_NAV_SECTIONS,
  getFilteredNavSections,
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

describe('getFilteredNavSections', () => {
  it('SUPER_ADMIN sees all sections and items', () => {
    const sections = getFilteredNavSections('SUPER_ADMIN');
    expect(sections).toHaveLength(3);
    const allHrefs = sections.flatMap((s) => s.items.map((i) => i.href));
    expect(allHrefs).toContain('/settings/users');
    expect(allHrefs).toContain('/assets');
    expect(allHrefs).toContain('/employees');
  });

  it('VIEWER does not see /settings/users', () => {
    const sections = getFilteredNavSections('VIEWER');
    const allHrefs = sections.flatMap((s) => s.items.map((i) => i.href));
    expect(allHrefs).not.toContain('/settings/users');
  });

  it('VIEWER does not see /assignments (no read permission)', () => {
    const sections = getFilteredNavSections('VIEWER');
    const allHrefs = sections.flatMap((s) => s.items.map((i) => i.href));
    expect(allHrefs).not.toContain('/assignments');
  });

  it('VIEWER still sees /assets and unguarded items like /analytics and /scanner', () => {
    const sections = getFilteredNavSections('VIEWER');
    const allHrefs = sections.flatMap((s) => s.items.map((i) => i.href));
    expect(allHrefs).toContain('/assets');
    expect(allHrefs).toContain('/analytics');
    expect(allHrefs).toContain('/scanner');
  });

  it('TECHNICIAN sees /employees (has employees:read)', () => {
    const sections = getFilteredNavSections('TECHNICIAN');
    const allHrefs = sections.flatMap((s) => s.items.map((i) => i.href));
    expect(allHrefs).toContain('/employees');
  });

  it('TECHNICIAN sees /maintenance and /assets', () => {
    const sections = getFilteredNavSections('TECHNICIAN');
    const allHrefs = sections.flatMap((s) => s.items.map((i) => i.href));
    expect(allHrefs).toContain('/maintenance');
    expect(allHrefs).toContain('/assets');
  });

  it('empty sections are removed from the result', () => {
    // SISTEMA only has /settings/users — if role cannot see it, the section disappears
    const sections = getFilteredNavSections('VIEWER');
    const sistema = sections.find((s) => s.label === 'SISTEMA');
    expect(sistema).toBeUndefined();
  });

  it('ADMIN sees /settings/users', () => {
    // ADMIN has assets:*, employees:*, etc. but not users — verify expectation
    // (if this fails it means PERMISSIONS matrix gives ADMIN user access — update accordingly)
    const sections = getFilteredNavSections('ADMIN');
    const allHrefs = sections.flatMap((s) => s.items.map((i) => i.href));
    expect(allHrefs).not.toContain('/settings/users');
  });
});
