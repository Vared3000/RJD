import { httpClient } from '../../../shared/api/http-client.js';
import { fileNameFromContentDisposition } from '../../../shared/lib/content-disposition.js';

export async function findInstanceByBarcode(barcode) {
  const { data } = await httpClient.get(`/barcodes/${encodeURIComponent(barcode)}`);
  return data.data;
}

export async function downloadLabels(instanceIds, labelType) {
  const response = await httpClient.post(
    '/barcodes/labels',
    { instanceIds, labelType },
    { responseType: 'blob' },
  );
  const url = URL.createObjectURL(response.data);
  const link = document.createElement('a');
  link.href = url;
  link.download =
    fileNameFromContentDisposition(response.headers['content-disposition']) ??
    `Этикетки_${labelType}.pdf`;
  document.body.appendChild(link);
  link.click();
  link.remove();
  URL.revokeObjectURL(url);
}
