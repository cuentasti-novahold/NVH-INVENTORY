// @vitest-environment node
import { describe, it, expect } from 'vitest';
import { hasPermission } from '@/lib/permissions';

describe('hasPermission', () => {
  describe('SUPER_ADMIN', () => {
    it('allows any resource and action', () => {
      expect(hasPermission('SUPER_ADMIN', 'assets', 'create')).toBe(true);
      expect(hasPermission('SUPER_ADMIN', 'users', 'delete')).toBe(true);
      expect(hasPermission('SUPER_ADMIN', 'maintenance', 'read')).toBe(true);
    });
  });

  describe('ADMIN', () => {
    it('allows all actions on assets, employees, assignments, categories, locations', () => {
      for (const resource of ['assets', 'employees', 'assignments', 'categories', 'locations'] as const) {
        for (const action of ['create', 'read', 'update', 'delete'] as const) {
          expect(hasPermission('ADMIN', resource, action)).toBe(true);
        }
      }
    });
    it('denies maintenance and users', () => {
      expect(hasPermission('ADMIN', 'maintenance', 'create')).toBe(false);
      expect(hasPermission('ADMIN', 'users', 'update')).toBe(false);
    });
  });

  describe('MANAGER', () => {
    it('allows assets:read, employees:read, assignments:create', () => {
      expect(hasPermission('MANAGER', 'assets', 'read')).toBe(true);
      expect(hasPermission('MANAGER', 'employees', 'read')).toBe(true);
      expect(hasPermission('MANAGER', 'assignments', 'create')).toBe(true);
    });
    it('denies write on assets', () => {
      expect(hasPermission('MANAGER', 'assets', 'create')).toBe(false);
      expect(hasPermission('MANAGER', 'assets', 'update')).toBe(false);
      expect(hasPermission('MANAGER', 'assets', 'delete')).toBe(false);
    });
    it('denies assignments:read, assignments:delete', () => {
      expect(hasPermission('MANAGER', 'assignments', 'read')).toBe(false);
      expect(hasPermission('MANAGER', 'assignments', 'delete')).toBe(false);
    });
  });

  describe('TECHNICIAN', () => {
    it('allows assets:create and assets:update', () => {
      expect(hasPermission('TECHNICIAN', 'assets', 'create')).toBe(true);
      expect(hasPermission('TECHNICIAN', 'assets', 'update')).toBe(true);
    });
    it('allows all maintenance actions', () => {
      for (const action of ['create', 'read', 'update', 'delete'] as const) {
        expect(hasPermission('TECHNICIAN', 'maintenance', action)).toBe(true);
      }
    });
    it('allows assets:read and employees:read', () => {
      expect(hasPermission('TECHNICIAN', 'assets', 'read')).toBe(true);
      expect(hasPermission('TECHNICIAN', 'employees', 'read')).toBe(true);
    });
    it('denies assets:delete', () => {
      expect(hasPermission('TECHNICIAN', 'assets', 'delete')).toBe(false);
    });
  });

  describe('VIEWER', () => {
    it('allows assets:read and employees:read', () => {
      expect(hasPermission('VIEWER', 'assets', 'read')).toBe(true);
      expect(hasPermission('VIEWER', 'employees', 'read')).toBe(true);
    });
    it('denies all writes', () => {
      for (const action of ['create', 'update', 'delete'] as const) {
        expect(hasPermission('VIEWER', 'assets', action)).toBe(false);
        expect(hasPermission('VIEWER', 'employees', action)).toBe(false);
      }
    });
    it('allows categories:read and locations:read', () => {
      expect(hasPermission('VIEWER', 'categories', 'read')).toBe(true);
      expect(hasPermission('VIEWER', 'locations', 'read')).toBe(true);
    });
    it('denies write access to categories, locations, and assignments', () => {
      expect(hasPermission('VIEWER', 'categories', 'create')).toBe(false);
      expect(hasPermission('VIEWER', 'locations', 'create')).toBe(false);
      expect(hasPermission('VIEWER', 'assignments', 'create')).toBe(false);
    });
  });
});
