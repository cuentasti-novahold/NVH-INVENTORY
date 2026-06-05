import { Font } from '@react-pdf/renderer';

const BASE = 'https://cdn.jsdelivr.net/npm/@fontsource/poppins@5.1.0/files';

Font.register({ family: 'Poppins', src: `${BASE}/poppins-latin-400-normal.woff2` });
Font.register({ family: 'Poppins-Bold', src: `${BASE}/poppins-latin-700-normal.woff2` });
Font.register({ family: 'Poppins-Italic', src: `${BASE}/poppins-latin-400-italic.woff2` });
