import { httpClient } from '../../../shared/api/http-client.js';

export async function downloadPrintForm(form, params) {
  const response = await httpClient.get(`/print-forms/${form}`, {
    params,
    responseType: 'blob',
  });
  const disposition = response.headers['content-disposition'] ?? '';
  const fileName = disposition.match(/filename="([^"]+)"/)?.[1] ?? `${form}.${params.format}`;
  const url = URL.createObjectURL(response.data);
  const link = document.createElement('a');
  link.href = url;
  link.download = fileName;
  document.body.appendChild(link);
  link.click();
  link.remove();
  URL.revokeObjectURL(url);
}
