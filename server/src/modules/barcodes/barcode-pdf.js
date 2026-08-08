import { createRequire } from 'node:module';
import PDFDocument from 'pdfkit';
import QRCode from 'qrcode';
import bwipjs from 'bwip-js';

const require = createRequire(import.meta.url);
const FONT = require.resolve('dejavu-fonts-ttf/ttf/DejaVuSans.ttf');
const FONT_BOLD = require.resolve('dejavu-fonts-ttf/ttf/DejaVuSans-Bold.ttf');
const LABEL_WIDTH = 283.46; // 100 мм
const LABEL_HEIGHT = 141.73; // 50 мм
const MARGIN = 12;

function collectPdf(doc) {
  return new Promise((resolve, reject) => {
    const chunks = [];
    doc.on('data', (chunk) => chunks.push(chunk));
    doc.on('end', () => resolve(Buffer.concat(chunks)));
    doc.on('error', reject);
  });
}

async function barcodePng(value, labelType) {
  if (labelType === 'code128') {
    return bwipjs.toBuffer({
      bcid: 'code128',
      text: value,
      scale: 3,
      height: 14,
      includetext: false,
      paddingwidth: 2,
      paddingheight: 2,
    });
  }
  return QRCode.toBuffer(value, {
    type: 'png',
    errorCorrectionLevel: 'M',
    margin: 1,
    width: 220,
  });
}

export async function createBarcodePdf(instances, { labelType = 'qr' } = {}) {
  const images = await Promise.all(
    instances.map((instance) =>
      barcodePng(instance.barcode || instance.inventoryNumber, labelType),
    ),
  );
  const doc = new PDFDocument({
    size: [LABEL_WIDTH, LABEL_HEIGHT],
    margin: 0,
    autoFirstPage: false,
  });
  const result = collectPdf(doc);
  doc.registerFont('LabelSans', FONT);
  doc.registerFont('LabelSansBold', FONT_BOLD);

  instances.forEach((instance, index) => {
    doc.addPage();
    const value = instance.barcode || instance.inventoryNumber;
    const modelName = instance.model?.name || 'Модель не указана';
    const size = [
      instance.size?.value,
      instance.heightSize?.value && `рост ${instance.heightSize.value}`,
    ]
      .filter(Boolean)
      .join(' / ');

    doc.font('LabelSansBold').fontSize(11).text(`Инв. № ${instance.inventoryNumber}`, MARGIN, 11, {
      width: 155,
      ellipsis: true,
    });
    doc.font('LabelSans').fontSize(8).text(modelName, MARGIN, 31, {
      width: 155,
      height: 38,
      ellipsis: true,
    });
    if (size) doc.text(`Размер: ${size}`, MARGIN, 72, { width: 155, ellipsis: true });

    if (labelType === 'code128') {
      doc.image(images[index], 165, 30, { fit: [106, 55], align: 'center', valign: 'center' });
    } else {
      doc.image(images[index], 184, 10, { width: 82, height: 82 });
    }
    doc.font('LabelSans').fontSize(7).text(value, 165, 98, {
      width: 106,
      align: 'center',
      ellipsis: true,
    });
    doc
      .fontSize(7)
      .text(`Статус: ${instance.status} · состояние: ${instance.condition}`, MARGIN, 118, {
        width: 255,
        ellipsis: true,
      });
  });

  doc.end();
  return result;
}
