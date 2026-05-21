import React, { useState, useRef } from 'react';
import { useDianRut } from '../context/DianRutContext';
import * as XLSX from 'xlsx';
import { 
  Upload, 
  FileSpreadsheet, 
  Check, 
  Cpu, 
  AlertTriangle, 
  Download, 
  Terminal, 
  RefreshCw,
  Clock,
  Play,
  Sparkles,
  Info
} from 'lucide-react';

export const ValidateView: React.FC = () => {
  const { startBatchValidation, activeJob, processingLog, downloadJobExcel, jobs } = useDianRut();
  
  // Drag and drop states
  const [dragActive, setDragActive] = useState(false);
  const [fileError, setFileError] = useState('');
  const [parsingProgress, setParsingProgress] = useState(false);
  
  const [parsedFileName, setParsedFileName] = useState('');
  const [parsedNits, setParsedNits] = useState<string[]>([]);
  const [fileSize, setFileSize] = useState(0);

  const fileInputRef = useRef<HTMLInputElement>(null);

  // Parse Excel / CSV using XLSX
  const handleFile = (file: File) => {
    setFileError('');
    setParsingProgress(true);
    setParsedNits([]);
    setParsedFileName(file.name);
    setFileSize(file.size);

    const reader = new FileReader();
    reader.onload = (e) => {
      try {
        const data = new Uint8Array(e.target?.result as ArrayBuffer);
        const workbook = XLSX.read(data, { type: 'array' });
        const firstSheetName = workbook.SheetNames[0];
        const worksheet = workbook.Sheets[firstSheetName];
        
        // Convert to 2D array matrix to inspect any cell and grab numbers
        const matrix = XLSX.utils.sheet_to_json<any[]>(worksheet, { header: 1 });
        
        const extracted: string[] = [];
        
        matrix.forEach((row: any) => {
          if (!row) return;
          const cells = Array.isArray(row) ? row : Object.values(row);
          
          cells.forEach(cell => {
            const cellVal = String(cell).trim();
            // Remove typical NIT formatting such as dots, hyphens, and DV suffix if added like "-3"
            const cleaned = cellVal.split('-')[0].replace(/[^0-9]/g, '');
            
            // Plausible Colombian NIT / Cédula sequence lengths (usually 6 to 11 digits)
            if (cleaned && cleaned.length >= 6 && cleaned.length <= 11) {
              extracted.push(cleaned);
            }
          });
        });

        const uniqueNits = Array.from(new Set(extracted));

        if (uniqueNits.length === 0) {
          setFileError('No se encontraron números NIT plausibles (entre 6 y 11 dígitos) en el archivo subido.');
          setParsedFileName('');
        } else {
          setParsedNits(uniqueNits);
        }
      } catch (err: any) {
        setFileError(`Error procesando la estructura del archivo Excel: ${err.message || 'Formato desconocido'}`);
        setParsedFileName('');
      } finally {
        setParsingProgress(false);
      }
    };

    reader.onerror = () => {
      setFileError('Ocurrió un error leyendo el binario del archivo.');
      setParsingProgress(false);
    };

    reader.readAsArrayBuffer(file);
  };

  const handleDrag = (e: React.DragEvent) => {
    e.preventDefault();
    e.stopPropagation();
    if (e.type === "dragenter" || e.type === "dragover") {
      setDragActive(true);
    } else if (e.type === "dragleave") {
      setDragActive(false);
    }
  };

  const handleDrop = (e: React.DragEvent) => {
    e.preventDefault();
    e.stopPropagation();
    setDragActive(false);

    if (e.dataTransfer.files && e.dataTransfer.files[0]) {
      const file = e.dataTransfer.files[0];
      const validTypes = ['.xlsx', '.xls', '.csv'];
      const ext = file.name.slice(file.name.lastIndexOf('.')).toLowerCase();
      if (validTypes.includes(ext)) {
        handleFile(file);
      } else {
        setFileError('Formato de archivo inválido. Por favor agregue .xlsx, .xls o .csv');
      }
    }
  };

  const triggerFileInput = () => {
    fileInputRef.current?.click();
  };

  const handleFileInputChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    if (e.target.files && e.target.files[0]) {
      handleFile(e.target.files[0]);
    }
  };

  const executeBulkProcessing = async () => {
    if (parsedNits.length === 0) return;
    try {
      await startBatchValidation(parsedFileName, fileSize, parsedNits);
      // Reset staging states on success so user can load next batch
      setParsedNits([]);
      setParsedFileName('');
    } catch (err) {
      console.error(err);
    }
  };

  // Generate and download a sample Excel file template decorated for DIAN validation
  const downloadTemplate = () => {
    const templateData = [
      { 'NIT / Identificación (Requerido)': '800197268', 'Nombre / Razón Social (Opcional)': 'EMPRESA DEMO ANDINA SAS' },
      { 'NIT / Identificación (Requerido)': '900123543', 'Nombre / Razón Social (Opcional)': '' },
      { 'NIT / Identificación (Requerido)': '830055110', 'Nombre / Razón Social (Opcional)': '' },
      { 'NIT / Identificación (Requerido)': '860002142', 'Nombre / Razón Social (Opcional)': '' },
      { 'NIT / Identificación (Requerido)': '901234567', 'Nombre / Razón Social (Opcional)': '' },
      { 'NIT / Identificación (Requerido)': '1018442111', 'Nombre / Razón Social (Opcional)': 'JUAN PEREZ (Cedula)' },
      { 'NIT / Identificación (Requerido)': '52140222', 'Nombre / Razón Social (Opcional)': 'MARIA RODRIGUEZ' },
      { 'NIT / Identificación (Requerido)': '890201121', 'Nombre / Razón Social (Opcional)': '' }
    ];

    const worksheet = XLSX.utils.json_to_sheet(templateData);
    const workbook = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(workbook, worksheet, "NITs_Modelos");
    
    // Set nice widths
    worksheet['!cols'] = [{ wch: 30 }, { wch: 35 }];
    
    XLSX.writeFile(workbook, "DIAN_Plantilla_NITs.xlsx");
  };

  // Obtain most recently completed batch details to render results
  const latestCompletedJob = jobs.find(j => j.status === 'COMPLETED');

  return (
    <div className="space-y-8 animate-fade-in">
      
      {/* Title block */}
      <div>
        <h2 className="text-2xl font-bold text-slate-900 tracking-tight">Carga de Lotes Masivos</h2>
        <p className="text-sm text-slate-500">
          Suba listas de NITs en archivos Excel (.xlsx) o CSV. El procesador extraerá las identificaciones, validará su Dígito de Verificación y recuperará sus estados RUT desde la DIAN.
        </p>
      </div>

      {/* Active Job Progress */}
      {activeJob && (
        <div className="bg-slate-900 text-white p-5 rounded-lg shrink-0 flex flex-col md:flex-row items-center gap-6 animate-slide-up select-none">
          <div className="shrink-0">
            <p className="text-[10.5px] text-slate-400 uppercase font-mono font-bold tracking-widest mb-1">PROCESANDO LOTE ACTIVO</p>
            <h2 className="text-sm font-bold truncate max-w-xs">{activeJob.fileName}</h2>
          </div>
          <div className="flex-1 w-full">
            <div className="flex justify-between items-end mb-2 text-xs text-slate-300 font-mono">
              <span>Progreso: {activeJob.processedCount} / {activeJob.totalRecords} NITs</span>
              <span className="font-bold">{Math.round((activeJob.processedCount / activeJob.totalRecords) * 100)}%</span>
            </div>
            <div className="h-2 bg-slate-700 rounded-full overflow-hidden">
              <div 
                className="h-full bg-blue-500 transition-all duration-300"
                style={{ width: `${(activeJob.processedCount / activeJob.totalRecords) * 100}%` }}
              />
            </div>
          </div>
          <div className="shrink-0 flex gap-2">
            <span className="px-3 py-1.5 bg-blue-600/30 text-blue-300 border border-blue-500/30 rounded text-[10px] font-bold uppercase font-mono tracking-wider animate-pulse">
              PROCESANDO EN REGLA
            </span>
          </div>
        </div>
      )}

      {/* Main Validation Stage */}
      <div className="grid grid-cols-1 lg:grid-cols-12 gap-6">
        
        {/* Upload column panel */}
        <div className="lg:col-span-6 bg-white p-6 border border-slate-200 rounded-2xl shadow-sm flex flex-col justify-between space-y-5">
          <div className="space-y-4">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-1.5 font-bold text-slate-800 text-sm">
                <FileSpreadsheet className="h-4.5 w-4.5 text-sky-500" />
                <span>Cargar Archivos de Contribuyentes</span>
              </div>
              <button
                id="template-download"
                onClick={downloadTemplate}
                className="text-xs text-sky-600 hover:text-sky-700 font-mono font-semibold flex items-center gap-1 bg-sky-50 px-2.5 py-1 rounded-lg border border-sky-100 hover:bg-sky-100/55 transition-colors"
              >
                <Download className="h-3 w-3" />
                <span>Descargar Plantilla Demo</span>
              </button>
            </div>

            {/* Drag & Drop Frame */}
            <div
              onDragEnter={handleDrag}
              onDragOver={handleDrag}
              onDragLeave={handleDrag}
              onDrop={handleDrop}
              onClick={triggerFileInput}
              className={`border-2 border-dashed rounded-xl p-8 text-center cursor-pointer transition-all ${
                dragActive 
                  ? 'border-sky-500 bg-sky-50/40' 
                  : 'border-slate-250 hover:bg-slate-50 bg-slate-50/20'
              }`}
            >
              <input
                ref={fileInputRef}
                type="file"
                accept=".xlsx,.xls,.csv"
                onChange={handleFileInputChange}
                className="hidden"
              />

              <div className="flex flex-col items-center justify-center space-y-3">
                <div className="p-4 bg-sky-50 rounded-full text-sky-500">
                  <Upload className="h-6 w-6" />
                </div>
                <div>
                  <p className="text-xs font-semibold text-slate-800">
                    Arrastre y suelte su archivo Excel aquí o <span className="text-sky-500 underline">busque en su dispositivo</span>
                  </p>
                  <p className="text-[10px] text-slate-400 mt-1 font-mono">Formatos compatibles: .xlsx, .xls, .csv</p>
                </div>
              </div>
            </div>

            {/* Error notifications */}
            {fileError && (
              <div className="p-3 bg-rose-50 border border-rose-200 rounded-xl text-xs text-rose-600 flex items-center gap-2">
                <AlertTriangle className="h-4 w-4 shrink-0" />
                <span>{fileError}</span>
              </div>
            )}

            {/* Current loaded staging NIT progress */}
            {parsingProgress && (
              <div className="p-4 bg-slate-50 border border-slate-200 rounded-xl text-xs text-slate-600 text-center flex items-center justify-center gap-2">
                <Cpu className="h-4 w-4 animate-spin text-sky-500" />
                <span>Analizando estructura de columnas y buscando números NIT...</span>
              </div>
            )}

            {/* Staged file panel (Prepared to launch) */}
            {parsedNits.length > 0 && !activeJob && (
              <div className="bg-slate-50/80 p-4 border border-slate-200 rounded-xl space-y-4 animate-slide-up">
                <div className="flex items-center justify-between">
                  <div className="truncate">
                    <p className="text-[10px] text-slate-400 font-mono uppercase">Archivo Listo Para Procesar</p>
                    <h4 className="text-xs font-bold text-slate-800 truncate">{parsedFileName}</h4>
                  </div>
                  <span className="bg-sky-500/10 text-sky-500 px-2 py-0.5 text-[10px] font-bold font-mono rounded">
                    {parsedNits.length} NITs
                  </span>
                </div>

                <div className="p-3 bg-white border border-slate-200 rounded-lg flex items-center gap-2.5 text-xs text-slate-500">
                  <Info className="h-4.5 w-4.5 text-sky-500 shrink-0" />
                  <p>
                    Se han extraído con éxito <strong>{parsedNits.length}</strong> números únicos de identificación del documento. Pulse ejecutar para validar el estado del impuesto DIAN.
                  </p>
                </div>

                <button
                  id="validate-execute"
                  onClick={executeBulkProcessing}
                  className="w-full py-3 px-4 bg-slate-900 hover:bg-slate-800 text-xs font-bold text-white rounded-xl flex items-center justify-center gap-1.5 transition-colors font-mono"
                >
                  <Play className="h-3.5 w-3.5 fill-current" />
                  <span>EJECUTAR VALIDACIÓN MASIVA</span>
                </button>
              </div>
            )}
          </div>

          {/* Quick info alerts */}
          <div className="p-4 bg-slate-900 border border-slate-800 rounded-xl text-slate-400 text-xs">
            <h5 className="font-semibold text-white flex items-center gap-1.5 mb-1">
              <Sparkles className="h-3.5 w-3.5 text-sky-400" />
              <span>Algoritmo de Verificación DIAN</span>
            </h5>
            <p className="leading-relaxed">
              La plataforma incluye cálculo matemático exacto del dígito de chequeo (DV) colombiano según Estatuto Tributario Art. 555-2, resolviendo colisiones y brindando trazabilidad segura.
            </p>
          </div>
        </div>

        {/* Console logs & processing panel (Active job status) */}
        <div className="lg:col-span-6 bg-slate-950 p-5 rounded-2xl shadow-lg border border-slate-905 min-h-[420px] flex flex-col justify-between font-mono text-xs">
          <div>
            {/* Header row */}
            <div className="flex items-center justify-between pb-3 border-b border-slate-900">
              <div className="flex items-center gap-2">
                <Terminal className="h-4.5 w-4.5 text-sky-400" />
                <span className="text-white font-bold font-mono">Terminal de Procesamiento</span>
              </div>
              <div className="flex items-center gap-1">
                <span className="w-2 h-2 rounded-full bg-emerald-400 animate-ping"></span>
                <span className="text-[10px] text-slate-400">ACTIVE LOG v1.0</span>
              </div>
            </div>

            {/* Stream logging space */}
            <div className="mt-4 space-y-2 max-h-[290px] overflow-y-auto custom-scrollbar text-slate-300">
              {processingLog.length > 0 ? (
                processingLog.map((log, index) => (
                  <div key={index} className="leading-relaxed">
                    <span className="text-slate-500 font-bold">{`>`}</span> {log}
                  </div>
                ))
              ) : (
                <div className="h-48 flex flex-col items-center justify-center text-slate-500 text-center select-none font-mono">
                  <Clock className="h-5 w-5 mb-2 text-slate-600 animate-pulse" />
                  <span>Aún no se ha iniciado ningún proceso de validación. Cargue un archivo Excel para observar el flujo de red.</span>
                </div>
              )}
            </div>
          </div>

          {/* Sinks progress stats */}
          <div>
            {activeJob ? (
              <div className="mt-4 pt-3.5 border-t border-slate-900 bg-slate-950/90 flex flex-col sm:flex-row items-center justify-between gap-3 text-slate-400">
                <div className="flex items-center gap-2.5">
                  <RefreshCw className="h-4.5 w-4.5 text-sky-400 animate-spin" />
                  <div>
                    <span className="font-bold text-white block">Sincronizando NITs en DIAN...</span>
                    <span className="text-[10px] text-slate-500">{activeJob.processedCount} de {activeJob.totalRecords} procesados</span>
                  </div>
                </div>
                
                {/* Visual percentage block */}
                <div className="flex items-center gap-3">
                  <div className="w-32 bg-slate-900 rounded-full h-1.5 overflow-hidden border border-slate-800">
                    <div 
                      className="bg-sky-500 h-full transition-all duration-200"
                      style={{ width: `${(activeJob.processedCount / activeJob.totalRecords) * 100}%` }}
                    />
                  </div>
                  <span className="text-white font-bold font-mono">
                    {Math.round((activeJob.processedCount / activeJob.totalRecords) * 100)}%
                  </span>
                </div>
              </div>
            ) : (
              <div className="mt-4 pt-3.5 border-t border-slate-900 flex items-center justify-between text-slate-500 text-[10px]">
                <span>MODO: SIMULACIÓN DIAN MUISCA CORE</span>
                <span>RETARDO PROMEDIO: 420ms</span>
              </div>
            )}
          </div>

        </div>

      </div>

      {/* Output results of the most recent validation batch */}
      {latestCompletedJob && (
        <div className="bg-white p-5 border border-slate-200 rounded-2xl shadow-sm space-y-5 animate-slide-up">
          <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
            <div>
              <p className="text-[10px] text-slate-400 font-mono uppercase">Lote Procesado con Éxito</p>
              <h3 className="text-base font-bold text-slate-900">{latestCompletedJob.fileName}</h3>
              <p className="text-xs text-slate-500">Resultados listos para descarga y exportación tributaria.</p>
            </div>

            <button
              id={`download-job-${latestCompletedJob.id}`}
              onClick={() => downloadJobExcel(latestCompletedJob.id)}
              className="flex items-center justify-center gap-2 px-4.5 py-3 rounded-xl text-xs font-bold text-white bg-emerald-600 hover:bg-emerald-700 font-mono transition-all shadow-md hover:shadow-lg hover:shadow-emerald-600/10"
            >
              <Download className="h-4 w-4" />
              <span>DESCARGAR EXCEL PROCESADO (.XLSX)</span>
            </button>
          </div>

          {/* Results table sheet snippet */}
          <div className="overflow-x-auto border border-slate-200 rounded-xl">
            <table className="min-w-full divide-y divide-slate-200 text-left text-xs">
              <thead className="bg-slate-50 font-mono text-[9px] uppercase font-bold text-slate-500 tracking-wider">
                <tr>
                  <th className="px-5 py-3">NIT</th>
                  <th className="px-5 py-3">Chequeo DV</th>
                  <th className="px-5 py-3">Razón Social o Contribuyente</th>
                  <th className="px-5 py-3">Estado RUT</th>
                  <th className="px-5 py-3">Cód. Actividad</th>
                  <th className="px-5 py-3">Trámite / Código Seguridad</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-200/70">
                {latestCompletedJob.records?.slice(0, 15).map((rec) => (
                  <tr key={rec.id} className="hover:bg-slate-50/50">
                    <td className="px-5 py-3 font-mono font-bold text-slate-900">{rec.nit}</td>
                    <td className="px-5 py-3 font-mono font-bold text-slate-500 text-center">{rec.dv}</td>
                    <td className="px-5 py-3 font-semibold text-slate-700 truncate max-w-[220px]" title={rec.companyName}>
                      {rec.companyName}
                    </td>
                    <td className="px-5 py-3">
                      <span className={`px-2 py-0.5 text-[9px] font-bold rounded font-mono border uppercase ${
                        rec.status === 'ACTIVO' 
                          ? 'bg-emerald-500/10 text-emerald-600 border-emerald-500/20' 
                          : rec.status === 'SUSPENDIDO'
                          ? 'bg-amber-500/10 text-amber-600 border-amber-500/20'
                          : 'bg-rose-500/10 text-rose-600 border-rose-500/20'
                      }`}>
                        {rec.status}
                      </span>
                    </td>
                    <td className="px-5 py-3 font-mono text-slate-600">
                      {rec.economicActivity}
                    </td>
                    <td className="px-5 py-3 text-slate-500 font-mono text-[10px]">
                      {rec.checkCode}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>

          {latestCompletedJob.records && latestCompletedJob.records.length > 15 && (
            <div className="text-center">
              <span className="text-xs text-slate-400 font-mono">
                Se muestran los primeros 15 registros de {latestCompletedJob.records.length} totales. Descargue el archivo para ver los datos completos de manera ordenada.
              </span>
            </div>
          )}
        </div>
      )}

    </div>
  );
};
