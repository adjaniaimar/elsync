const { parentPort, workerData } = require('worker_threads');
const exportUtil = require('./export');

(async () => {
  const { format, rows } = workerData;

  try {
    let type, data;

    if (format === 'json') {
      type = 'text';
      data = exportUtil.toJSON(rows);
    } else if (format === 'csv') {
      type = 'text';
      data = exportUtil.toCSV(rows);
    } else if (format === 'xlsx') {
      type = 'buffer';
      data = await exportUtil.toExcel(rows);
    } else if (format === 'pdf') {
      type = 'buffer';
      data = await exportUtil.toPDF(rows);
    } else {
      throw new Error(`Format tidak dikenali: ${format}`);
    }

    parentPort.postMessage({ success: true, type, data });
  } catch (err) {
    parentPort.postMessage({ success: false, error: err.message });
  }
})();