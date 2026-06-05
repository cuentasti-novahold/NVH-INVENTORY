import { Document, Page, Text, View, StyleSheet } from '@react-pdf/renderer';
import '@/shared/pdf/fonts';
import type { AssetHistoryData } from '@/app/(dashboard)/assets/actions';

const styles = StyleSheet.create({
  page: { padding: 40, fontFamily: 'Poppins', fontSize: 10, color: '#111' },
  title: { fontSize: 16, fontWeight: 'bold', marginBottom: 4 },
  subtitle: { fontSize: 10, color: '#666', marginBottom: 20 },
  section: { marginBottom: 16 },
  sectionTitle: { fontSize: 11, fontWeight: 'bold', marginBottom: 6, borderBottom: '1px solid #ccc', paddingBottom: 2 },
  row: { flexDirection: 'row', marginBottom: 3 },
  label: { width: 140, color: '#666' },
  value: { flex: 1 },
  tableHeader: { flexDirection: 'row', backgroundColor: '#f3f4f6', padding: '4 6', marginBottom: 2 },
  tableRow: { flexDirection: 'row', padding: '3 6', borderBottom: '0.5px solid #e5e7eb' },
  col1: { width: '40%' },
  col2: { width: '30%' },
  col3: { width: '30%' },
  empty: { color: '#999', fontStyle: 'italic' },
});

interface AssetHistoryPDFProps {
  data: AssetHistoryData;
}

export function AssetHistoryPDF({ data }: AssetHistoryPDFProps) {
  const { asset, assignments, maintenances } = data;

  return (
    <Document>
      <Page size="A4" style={styles.page}>
        <Text style={styles.title}>Historial — {asset.assetCode}</Text>
        <Text style={styles.subtitle}>
          {asset.categoryName} · Generado {new Date().toLocaleDateString('es-CO')}
        </Text>

        {/* Asset data */}
        <View style={styles.section}>
          <Text style={styles.sectionTitle}>Datos del activo</Text>
          <View style={styles.row}><Text style={styles.label}>Marca / Modelo</Text><Text style={styles.value}>{[asset.brand, asset.model].filter(Boolean).join(' ') || '—'}</Text></View>
          <View style={styles.row}><Text style={styles.label}>Serial</Text><Text style={styles.value}>{asset.serialNumber ?? '—'}</Text></View>
          <View style={styles.row}><Text style={styles.label}>Estado</Text><Text style={styles.value}>{asset.generalStatus}</Text></View>
          <View style={styles.row}><Text style={styles.label}>Sede</Text><Text style={styles.value}>{asset.locationName ?? '—'}</Text></View>
        </View>

        {/* Assignments */}
        <View style={styles.section}>
          <Text style={styles.sectionTitle}>Asignaciones ({assignments.length})</Text>
          {assignments.length === 0 ? (
            <Text style={styles.empty}>Sin registros</Text>
          ) : (
            <>
              <View style={styles.tableHeader}>
                <Text style={styles.col1}>Empleado</Text>
                <Text style={styles.col2}>Asignado</Text>
                <Text style={styles.col3}>Devuelto</Text>
              </View>
              {assignments.map((a, i) => (
                <View key={i} style={styles.tableRow}>
                  <Text style={styles.col1}>{a.employeeName}</Text>
                  <Text style={styles.col2}>{new Date(a.assignedAt).toLocaleDateString('es-CO')}</Text>
                  <Text style={styles.col3}>{a.returnedAt ? new Date(a.returnedAt).toLocaleDateString('es-CO') : 'Activo'}</Text>
                </View>
              ))}
            </>
          )}
        </View>

        {/* Maintenances */}
        <View style={styles.section}>
          <Text style={styles.sectionTitle}>Mantenimientos ({maintenances.length})</Text>
          {maintenances.length === 0 ? (
            <Text style={styles.empty}>Sin registros</Text>
          ) : (
            <>
              <View style={styles.tableHeader}>
                <Text style={styles.col1}>Tipo</Text>
                <Text style={styles.col2}>Descripción</Text>
                <Text style={styles.col3}>Fecha</Text>
              </View>
              {maintenances.map((m, i) => (
                <View key={i} style={styles.tableRow}>
                  <Text style={styles.col1}>{m.type}</Text>
                  <Text style={styles.col2}>{m.description ?? '—'}</Text>
                  <Text style={styles.col3}>{new Date(m.performedAt).toLocaleDateString('es-CO')}</Text>
                </View>
              ))}
            </>
          )}
        </View>
      </Page>
    </Document>
  );
}
