import { httpClient } from '../../../shared/api/http-client.js';
import { fileNameFromContentDisposition } from '../../../shared/lib/content-disposition.js';

const BASE = '/print-forms/templates';

function downloadBlob(blob, fileNameFromHeader, fallbackName) {
  const url = URL.createObjectURL(blob);
  const link = document.createElement('a');
  link.href = url;
  link.download = fileNameFromHeader ?? fallbackName;
  document.body.appendChild(link);
  link.click();
  link.remove();
  URL.revokeObjectURL(url);
}

function fileNameFromResponse(response) {
  const disposition = response.headers['content-disposition'] ?? '';
  return fileNameFromContentDisposition(disposition);
}

export const printFormTemplatesApi = {
  async list(formType) {
    const { data } = await httpClient.get(`${BASE}/${formType}`);
    return data.data;
  },

  async upload(formType, { file, dpoId, employeeId, from, to, comment }) {
    const formData = new FormData();
    formData.append('file', file);
    formData.append('dpoId', dpoId);
    if (employeeId) formData.append('employeeId', employeeId);
    formData.append('from', from);
    formData.append('to', to);
    if (comment) formData.append('comment', comment);
    const { data } = await httpClient.post(`${BASE}/${formType}/versions`, formData);
    return data.data;
  },

  async activate(id) {
    const { data } = await httpClient.post(`${BASE}/versions/${id}/activate`);
    return data.data;
  },

  async layout(id) {
    const { data } = await httpClient.get(`${BASE}/versions/${id}/layout`);
    return data.data;
  },

  async newLayout(formType) {
    const { data } = await httpClient.get(`${BASE}/${formType}/layout/new`);
    return data.data;
  },

  async saveLayout(id, { layout, dpoId, employeeId, from, to, comment }) {
    const { data } = await httpClient.post(`${BASE}/versions/${id}/layout`, {
      layout,
      dpoId,
      employeeId,
      from,
      to,
      comment,
    });
    return data.data;
  },

  async saveNewLayout(formType, { layout, dpoId, employeeId, from, to, comment }) {
    const { data } = await httpClient.post(`${BASE}/${formType}/layout/new`, {
      layout,
      dpoId,
      employeeId,
      from,
      to,
      comment,
    });
    return data.data;
  },

  async previewLayout(id, { layout, format, dpoId, employeeId, from, to }) {
    const response = await httpClient.post(
      `${BASE}/versions/${id}/layout/preview`,
      { layout, format, dpoId, employeeId, from, to },
      { responseType: 'blob' },
    );
    downloadBlob(response.data, fileNameFromResponse(response), `Черновик_макета.${format}`);
  },

  async previewNewLayout(formType, { layout, format, dpoId, employeeId, from, to }) {
    const response = await httpClient.post(
      `${BASE}/${formType}/layout/new/preview`,
      { layout, format, dpoId, employeeId, from, to },
      { responseType: 'blob' },
    );
    downloadBlob(response.data, fileNameFromResponse(response), `Новый_макет.${format}`);
  },

  async download(id, fallbackName = 'Шаблон.xlsx') {
    const response = await httpClient.get(`${BASE}/versions/${id}/download`, {
      responseType: 'blob',
    });
    downloadBlob(response.data, fileNameFromResponse(response), fallbackName);
  },

  async preview(id, { format, dpoId, employeeId, from, to }) {
    const response = await httpClient.get(`${BASE}/versions/${id}/preview`, {
      params: { format, dpoId, employeeId, from, to },
      responseType: 'blob',
    });
    downloadBlob(response.data, fileNameFromResponse(response), `Предпросмотр_шаблона.${format}`);
  },
};
