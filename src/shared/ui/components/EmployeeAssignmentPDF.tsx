import { Document, Page, Text, View, StyleSheet } from '@react-pdf/renderer';
import type { EmployeeAssignmentReportData } from '@/app/(dashboard)/employees/actions';

const STATUS_LABELS: Record<string, string> = {
  GOOD: 'Bueno',
  REGULAR: 'Regular',
  BAD: 'Malo',
  DAMAGED: 'Dañado',
  RETIRED: 'Dado de baja',
};

const NAVY = '#00365f';
const TEAL = '#17af95';
const NAVY_LIGHT = '#e8f0f7';
const TEAL_LIGHT = '#e8f8f5';
const INK = '#111827';
const INK_SECONDARY = '#4b5563';
const INK_MUTED = '#9ca3af';
const BORDER = '#e5e7eb';
const WHITE = '#ffffff';

const styles = StyleSheet.create({
  page: {
    fontFamily: 'Helvetica',
    fontSize: 9.5,
    color: INK,
    backgroundColor: WHITE,
  },

  // ── Header band ──────────────────────────────────────────────────────────
  headerBand: {
    backgroundColor: NAVY,
    paddingTop: 28,
    paddingBottom: 22,
    paddingLeft: 36,
    paddingRight: 36,
  },
  headerOrg: {
    fontSize: 7.5,
    color: TEAL,
    letterSpacing: 2,
    textTransform: 'uppercase',
    marginBottom: 6,
  },
  headerTitle: {
    fontSize: 20,
    fontFamily: 'Helvetica-Bold',
    color: WHITE,
    letterSpacing: -0.3,
    marginBottom: 8,
  },
  headerMeta: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
  },
  headerMetaChip: {
    backgroundColor: 'rgba(255,255,255,0.10)',
    borderRadius: 3,
    paddingTop: 2,
    paddingBottom: 2,
    paddingLeft: 7,
    paddingRight: 7,
  },
  headerMetaText: {
    fontSize: 8,
    color: 'rgba(255,255,255,0.75)',
  },

  // ── Teal accent line ──────────────────────────────────────────────────────
  accentLine: {
    height: 3,
    backgroundColor: TEAL,
  },

  // ── Body ──────────────────────────────────────────────────────────────────
  body: {
    paddingTop: 24,
    paddingBottom: 32,
    paddingLeft: 36,
    paddingRight: 36,
  },

  // ── Section ───────────────────────────────────────────────────────────────
  section: { marginBottom: 20 },
  sectionHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    marginBottom: 10,
  },
  sectionAccentBar: {
    width: 3,
    height: 13,
    backgroundColor: TEAL,
    marginRight: 7,
    borderRadius: 1.5,
  },
  sectionTitle: {
    fontSize: 8,
    fontFamily: 'Helvetica-Bold',
    color: NAVY,
    letterSpacing: 1.2,
    textTransform: 'uppercase',
  },

  // ── Employee data grid ────────────────────────────────────────────────────
  dataGrid: {
    backgroundColor: '#f9fafb',
    border: `1px solid ${BORDER}`,
    borderRadius: 4,
    paddingTop: 12,
    paddingBottom: 12,
    paddingLeft: 16,
    paddingRight: 16,
  },
  dataRow: {
    flexDirection: 'row',
    marginBottom: 6,
  },
  dataRowLast: {
    flexDirection: 'row',
    marginBottom: 0,
  },
  dataLabel: {
    width: 100,
    fontSize: 8.5,
    color: INK_MUTED,
    fontFamily: 'Helvetica',
  },
  dataValue: {
    flex: 1,
    fontSize: 8.5,
    color: INK,
    fontFamily: 'Helvetica-Bold',
  },

  // ── Asset table ───────────────────────────────────────────────────────────
  tableContainer: {
    border: `1px solid ${BORDER}`,
    borderRadius: 4,
    overflow: 'hidden',
  },
  tableHead: {
    flexDirection: 'row',
    backgroundColor: NAVY,
    paddingTop: 7,
    paddingBottom: 7,
    paddingLeft: 10,
    paddingRight: 10,
  },
  tableHeadCell: {
    fontSize: 7.5,
    fontFamily: 'Helvetica-Bold',
    color: WHITE,
    letterSpacing: 0.5,
  },
  tableRow: {
    flexDirection: 'row',
    paddingTop: 6,
    paddingBottom: 6,
    paddingLeft: 10,
    paddingRight: 10,
  },
  tableRowEven: {
    backgroundColor: TEAL_LIGHT,
  },
  tableRowOdd: {
    backgroundColor: WHITE,
  },
  tableRowBorder: {
    borderBottom: `0.5px solid ${BORDER}`,
  },
  tableCell: {
    fontSize: 8.5,
    color: INK_SECONDARY,
  },
  tableCellCode: {
    fontSize: 8,
    fontFamily: 'Helvetica-Bold',
    color: NAVY,
  },

  // Column widths
  cCode: { width: '22%' },
  cDesc: { width: '30%' },
  cSerial: { width: '20%' },
  cStatus: { width: '14%' },
  cDate: { width: '14%' },

  // Status badge
  statusBadge: {
    backgroundColor: NAVY_LIGHT,
    borderRadius: 2,
    paddingTop: 1,
    paddingBottom: 1,
    paddingLeft: 4,
    paddingRight: 4,
    alignSelf: 'flex-start',
  },
  statusBadgeText: {
    fontSize: 7.5,
    color: NAVY,
    fontFamily: 'Helvetica-Bold',
  },

  empty: { color: INK_MUTED, fontStyle: 'italic', fontSize: 9 },

  // ── Declaration ───────────────────────────────────────────────────────────
  declarationBox: {
    backgroundColor: '#fffbeb',
    border: `1px solid #fde68a`,
    borderLeft: `3px solid #f59e0b`,
    borderRadius: 4,
    paddingTop: 10,
    paddingBottom: 10,
    paddingLeft: 12,
    paddingRight: 12,
  },
  declarationText: {
    fontSize: 8.5,
    color: '#78350f',
    lineHeight: 1.55,
  },

  // ── Signatures ────────────────────────────────────────────────────────────
  signRow: {
    flexDirection: 'row',
    marginTop: 32,
    justifyContent: 'space-between',
    gap: 24,
  },
  signBox: {
    flex: 1,
    borderTop: `2px solid ${NAVY}`,
    paddingTop: 8,
  },
  signName: {
    fontSize: 9,
    fontFamily: 'Helvetica-Bold',
    color: INK,
    marginBottom: 3,
  },
  signMeta: {
    fontSize: 8,
    color: INK_MUTED,
    marginBottom: 2,
  },
  signField: {
    fontSize: 8,
    color: INK_SECONDARY,
    borderBottom: `0.5px solid ${BORDER}`,
    paddingBottom: 2,
    marginBottom: 4,
    marginTop: 8,
  },

  // ── Footer ────────────────────────────────────────────────────────────────
  footer: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    borderTop: `1px solid ${BORDER}`,
    marginTop: 24,
    paddingTop: 8,
  },
  footerText: {
    fontSize: 7.5,
    color: INK_MUTED,
  },
  footerBrand: {
    fontSize: 7.5,
    color: TEAL,
    fontFamily: 'Helvetica-Bold',
  },
});

interface EmployeeAssignmentPDFProps {
  data: EmployeeAssignmentReportData;
}

export function EmployeeAssignmentPDF({ data }: EmployeeAssignmentPDFProps) {
  const { employee, assignments, generatedAt } = data;

  const generatedDate = new Date(generatedAt).toLocaleDateString('es-CO', {
    day: '2-digit',
    month: '2-digit',
    year: 'numeric',
  });

  return (
    <Document>
      <Page size="A4" style={styles.page}>
        {/* ── Header band ─────────────────────────────────────────────── */}
        <View style={styles.headerBand}>
          <Text style={styles.headerOrg}>Novahold · Gestión de Activos</Text>
          <Text style={styles.headerTitle}>Acta de Asignación de Equipos</Text>
          <View style={styles.headerMeta}>
            <View style={styles.headerMetaChip}>
              <Text style={styles.headerMetaText}>{employee.fullName}</Text>
            </View>
            <View style={styles.headerMetaChip}>
              <Text style={styles.headerMetaText}>Generado {generatedDate}</Text>
            </View>
            <View style={styles.headerMetaChip}>
              <Text style={styles.headerMetaText}>
                {assignments.length} equipo{assignments.length !== 1 ? 's' : ''} asignado{assignments.length !== 1 ? 's' : ''}
              </Text>
            </View>
          </View>
        </View>

        {/* ── Teal accent ─────────────────────────────────────────────── */}
        <View style={styles.accentLine} />

        {/* ── Body ────────────────────────────────────────────────────── */}
        <View style={styles.body}>
          {/* Datos del empleado */}
          <View style={styles.section}>
            <View style={styles.sectionHeader}>
              <View style={styles.sectionAccentBar} />
              <Text style={styles.sectionTitle}>Datos del empleado</Text>
            </View>
            <View style={styles.dataGrid}>
              <View style={styles.dataRow}>
                <Text style={styles.dataLabel}>Nombre</Text>
                <Text style={styles.dataValue}>{employee.fullName}</Text>
              </View>
              <View style={styles.dataRow}>
                <Text style={styles.dataLabel}>Cargo</Text>
                <Text style={styles.dataValue}>{employee.position ?? '—'}</Text>
              </View>
              <View style={styles.dataRow}>
                <Text style={styles.dataLabel}>Email</Text>
                <Text style={styles.dataValue}>{employee.email}</Text>
              </View>
              {employee.phone && (
                <View style={styles.dataRow}>
                  <Text style={styles.dataLabel}>Teléfono</Text>
                  <Text style={styles.dataValue}>{employee.phone}</Text>
                </View>
              )}
              <View style={styles.dataRow}>
                <Text style={styles.dataLabel}>Departamento</Text>
                <Text style={styles.dataValue}>{employee.departmentName ?? '—'}</Text>
              </View>
              <View style={styles.dataRow}>
                <Text style={styles.dataLabel}>Sede</Text>
                <Text style={styles.dataValue}>{employee.locationName ?? '—'}</Text>
              </View>
              <View style={styles.dataRowLast}>
                <Text style={styles.dataLabel}>Ciudad</Text>
                <Text style={styles.dataValue}>{employee.cityName ?? '—'}</Text>
              </View>
            </View>
          </View>

          {/* Equipos asignados */}
          <View style={styles.section}>
            <View style={styles.sectionHeader}>
              <View style={styles.sectionAccentBar} />
              <Text style={styles.sectionTitle}>
                Equipos asignados ({assignments.length})
              </Text>
            </View>

            {assignments.length === 0 ? (
              <Text style={styles.empty}>Sin equipos asignados</Text>
            ) : (
              <View style={styles.tableContainer}>
                <View style={styles.tableHead}>
                  <Text style={[styles.tableHeadCell, styles.cCode]}>Código</Text>
                  <Text style={[styles.tableHeadCell, styles.cDesc]}>Marca / Modelo</Text>
                  <Text style={[styles.tableHeadCell, styles.cSerial]}>Serial</Text>
                  <Text style={[styles.tableHeadCell, styles.cStatus]}>Estado</Text>
                  <Text style={[styles.tableHeadCell, styles.cDate]}>Asignado</Text>
                </View>
                {assignments.map((a, i) => (
                  <View
                    key={i}
                    style={[
                      styles.tableRow,
                      i % 2 === 0 ? styles.tableRowOdd : styles.tableRowEven,
                      i < assignments.length - 1 ? styles.tableRowBorder : {},
                    ]}
                  >
                    <Text style={[styles.tableCellCode, styles.cCode]}>
                      {a.assetCode}
                    </Text>
                    <Text style={[styles.tableCell, styles.cDesc]}>
                      {[a.brand, a.model].filter(Boolean).join(' ') || '—'}
                    </Text>
                    <Text style={[styles.tableCell, styles.cSerial]}>
                      {a.serialNumber ?? '—'}
                    </Text>
                    <View style={styles.cStatus}>
                      <View style={styles.statusBadge}>
                        <Text style={styles.statusBadgeText}>
                          {STATUS_LABELS[a.generalStatus] ?? a.generalStatus}
                        </Text>
                      </View>
                    </View>
                    <Text style={[styles.tableCell, styles.cDate]}>
                      {new Date(a.assignedAt).toLocaleDateString('es-CO')}
                    </Text>
                  </View>
                ))}
              </View>
            )}
          </View>

          {/* Declaración de responsabilidad */}
          <View style={styles.section}>
            <View style={styles.sectionHeader}>
              <View style={styles.sectionAccentBar} />
              <Text style={styles.sectionTitle}>Declaración de responsabilidad</Text>
            </View>
            <View style={styles.declarationBox}>
              <Text style={styles.declarationText}>
                Yo, {employee.fullName}, declaro haber recibido los equipos tecnológicos
                listados en el presente documento en buen estado de funcionamiento. Me
                comprometo a hacer un uso adecuado de los mismos, a mantenerlos bajo mi
                custodia y responsabilidad, y a devolverlos en las mismas condiciones al
                área de Tecnología cuando me sea requerido o al momento de finalizar mi
                vinculación con la organización. El daño, pérdida o mal uso de los equipos
                podrá generar las responsabilidades legales y disciplinarias correspondientes.
              </Text>
            </View>
          </View>

          {/* Firmas */}
          <View style={styles.signRow}>
            <View style={styles.signBox}>
              <Text style={styles.signName}>{employee.fullName}</Text>
              <Text style={styles.signMeta}>Empleado</Text>
              <Text style={styles.signField}>C.C. ___________________________</Text>
              <Text style={styles.signField}>Firma ___________________________</Text>
              <Text style={styles.signField}>Fecha ___________________________</Text>
            </View>
            <View style={styles.signBox}>
              <Text style={styles.signName}>Representante Novahold</Text>
              <Text style={styles.signMeta}>Área de Tecnología</Text>
              <Text style={styles.signField}>Nombre ___________________________</Text>
              <Text style={styles.signField}>Firma ___________________________</Text>
              <Text style={styles.signField}>Fecha ___________________________</Text>
            </View>
          </View>

          {/* Footer */}
          <View style={styles.footer}>
            <Text style={styles.footerText}>
              Documento generado el {generatedDate} · Sistema de Gestión de Inventario
            </Text>
            <Text style={styles.footerBrand}>NOVAHOLD</Text>
          </View>
        </View>
      </Page>
    </Document>
  );
}
