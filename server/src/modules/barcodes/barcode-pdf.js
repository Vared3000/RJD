import PDFDocument from 'pdfkit';

const LABEL_WIDTH = 200;
const LABEL_HEIGHT = 100;
const MARGIN = 10;
const QR_SIZE = 80;

// Генерация PDF с этикетками
export async function createBarcodePDF(instances) {
  return new Promise((resolve, reject) => {
    const chunks = [];
    const doc = new PDFDocument({ size: [LABEL_WIDTH, LABEL_HEIGHT], margin: 0 });

    // Собираем байты PDF
    doc.on('data', (chunk) => chunks.push(chunk));
    doc.on('end', () => {
      const pdfBytes = Buffer.concat(chunks);
      resolve({
        pdfBytes,
        pageCount: instances.length,
        instances: instances.map((i) => ({
          id: i.id,
          inventoryNumber: i.inventoryNumber,
        })),
      });
    });
    doc.on('error', reject);

    for (const instance of instances) {
      const { width, height } = doc.page;

      // Инвентарный номер (жирный)
      doc.font('Helvetica-Bold');
      doc.fontSize(12);
      doc.text(`Инв. № ${instance.inventoryNumber}`, MARGIN, MARGIN);

      // Модель
      doc.font('Helvetica');
      const modelName = instance.model?.name || 'Модель не определена';
      doc.fontSize(10);
      doc.text(modelName, MARGIN, MARGIN + 18);

      // Размер
      let sizeText = '';
      if (instance.size) {
        sizeText += `${instance.size.value}`;
      }
      if (instance.heightSize) {
        sizeText += sizeText ? ', ' : '';
        sizeText += `Рост: ${instance.heightSize.value}`;
      }
      if (sizeText) {
        doc.text(sizeText, MARGIN, MARGIN + 32);
      }

      // QR-код (используем внешний сервис через URL)
      const barcodeY = height / 2 - QR_SIZE / 2;
      const qrUrl = generateQrUrl(instance.inventoryNumber, QR_SIZE);
      doc.image(qrUrl, width - QR_SIZE - MARGIN, barcodeY, { width: QR_SIZE, height: QR_SIZE });

      // Текстовое представление barcode
      doc.fontSize(8);
      doc.text(instance.inventoryNumber, width - QR_SIZE - MARGIN, barcodeY + QR_SIZE + 5);

      // Статус и состояние (внизу слева)
      doc.text(`Статус: ${instance.status}`, MARGIN, height - MARGIN - 10);
      doc.text(`Состояние: ${instance.condition}`, MARGIN, height - MARGIN);

      // ДПО
      if (instance.batch?.dpo) {
        doc.text(instance.batch.dpo.name, width / 2, MARGIN);
      }

      doc.addPage();
    }

    // Удаляем последнюю пустую страницу
    doc.removePage(doc.pageCount);
    doc.end();
  });
}

// Генерация URL для QR-кода
export function generateQrUrl(data, size = 200) {
  const encoded = encodeURIComponent(data);
  return `https://api.qrserver.com/v1/create-qr-code/?data=${encoded}&size=${size}x${size}`;
}
