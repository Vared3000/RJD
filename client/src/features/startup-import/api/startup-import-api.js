import { httpClient } from '../../../shared/api/http-client.js';
import { fileNameFromContentDisposition } from '../../../shared/lib/content-disposition.js';

const BASE = '/startup-import';

function downloadBlob(blob, fileName) {
  const url = URL.createObjectURL(blob);
  const link = document.createElement('a');
  link.href = url;
  link.download = fileName;
  document.body.appendChild(link);
  link.click();
  link.remove();
  URL.revokeObjectURL(url);
}

export const startupImportApi = {
  async list() {
    const { data } = await httpClient.get(BASE);
    return data.data;
  },

  async downloadTemplate() {
    const response = await httpClient.get(`${BASE}/template`, { responseType: 'blob' });
    downloadBlob(
      response.data,
      fileNameFromContentDisposition(response.headers['content-disposition']) ??
        'Шаблон_стартового_импорта.xlsx',
    );
  },

  async preview(file) {
    const formData = new FormData();
    formData.append('file', file);
    const { data } = await httpClient.post(`${BASE}/preview`, formData);
    return data.data;
  },

  async apply(id) {
    const { data } = await httpClient.post(`${BASE}/${id}/apply`);
    return data.data;
  },
};
