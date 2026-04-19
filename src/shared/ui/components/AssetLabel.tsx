import { Document, Page, View, Text, Image, StyleSheet } from '@react-pdf/renderer';

const styles = StyleSheet.create({
  page: {
    width: 226,
    height: 113,
    padding: 8,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
  },
  qr: {
    width: 90,
    height: 90,
  },
  info: {
    flex: 1,
    flexDirection: 'column',
    justifyContent: 'center',
    gap: 4,
  },
  code: {
    fontSize: 10,
    fontWeight: 'bold',
    letterSpacing: 0.5,
  },
  name: {
    fontSize: 8,
    color: '#555',
  },
});

export interface AssetLabelProps {
  assetCode: string;
  brand: string | null;
  model: string | null;
  qrDataUrl: string;
}

export function AssetLabel({ assetCode, brand, model, qrDataUrl }: AssetLabelProps) {
  const displayName = [brand, model].filter(Boolean).join(' ') || 'Sin nombre';
  return (
    <Document>
      <Page size={[226, 113]} style={styles.page}>
        <Image src={qrDataUrl} style={styles.qr} />
        <View style={styles.info}>
          <Text style={styles.code}>{assetCode}</Text>
          <Text style={styles.name}>{displayName}</Text>
        </View>
      </Page>
    </Document>
  );
}
