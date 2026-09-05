import { httpClient } from '../../../shared/api/http-client.js';
import { fileNameFromContentDisposition } from '../../../shared/lib/content-disposition.js';

function pruneParams(params) {
  return Object.fromEntries(Object.entries(params).filter(([, v]) => v !== undefined && v !== ''));
}

function saveDownload(response, fallbackName) {
  const disposition = response.headers['content-disposition'] ?? '';
  const fileName = fileNameFromContentDisposition(disposition) ?? fallbackName;
  const url = URL.createObjectURL(response.data);
  const link = document.createElement('a');
  link.href = url;
  link.download = fileName;
  document.body.appendChild(link);
  link.click();
  link.remove();
  URL.revokeObjectURL(url);
}

export async function downloadPrintForm(form, params) {
  const response = await httpClient.get(`/print-forms/${form}`, {
    params: pruneParams(params ?? {}),
    responseType: 'blob',
  });
  saveDownload(response, `Печатная_форма.${params.format}`);
}

export async function downloadMonthlyRentalVersion(actId, versionNumber, format) {
  const response = await httpClient.get(
    `/print-forms/monthly-rental/${actId}/versions/${versionNumber}/${format}`,
    { responseType: 'blob' },
  );
  saveDownload(response, `Акт_аренды_Версия_${versionNumber}.${format}`);
}

export async function previewMonthlyRental(params) {
  const response = await httpClient.get('/print-forms/monthly-rental/preview', {
    params: pruneParams(params ?? {}),
  });
  return response.data.data;
}
