import React from 'react';
import { useDianRut } from '../context/DianRutContext';
import { 
  FileSpreadsheet, 
  Download, 
  Trash2, 
  Clock, 
  Calendar, 
  Layers, 
  Database,
  CheckCircle,
  AlertTriangle,
  XSquare,
  Sparkles
} from 'lucide-react';

export const HistoryView: React.FC = () => {
  const { jobs, downloadJobExcel, deleteJob, clearAllJobs } = useDianRut();

  // Helper to calculate status breakdown inside a job
  const getJobBreakdown = (job: any) => {
    let active = 0;
    let suspended = 0;
    let canceled = 0;

    if (job.records) {
      job.records.forEach((rec: any) => {
        if (rec.status === 'ACTIVO') active++;
        else if (rec.status === 'SUSPENDIDO') suspended++;
        else canceled++;
      });
    }

    return { active, suspended, canceled };
  };

  const completedJobs = jobs.filter(j => j.status === 'COMPLETED');

  return (
    <div className="space-y-8 animate-fade-in">
      
      {/* View Header row */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div>
          <h2 className="text-2xl font-bold text-slate-900 tracking-tight">Historial de Lotes Procesados</h2>
          <p className="text-sm text-slate-500">
            Consulte, audite y descargue nuevamente los reportes de validaciones RUT realizados en la plataforma.
          </p>
        </div>

        {completedJobs.length > 0 && (
          <button
            id="clear-all-jobs-btn"
            onClick={() => {
              if (confirm('¿Está seguro de que desea vaciar todo el historial de consultas de la base de datos local? Esta acción no se puede deshacer.')) {
                clearAllJobs();
              }
            }}
            className="px-4 py-2.5 bg-rose-50 border border-rose-200 text-rose-650 rounded-xl text-xs font-semibold hover:bg-rose-100/70 hover:border-rose-300 transition-colors font-mono flex items-center gap-1.5 shrink-0"
          >
            <Trash2 className="h-4 w-4" />
            <span>Eliminar Todo el Historial</span>
          </button>
        )}
      </div>

      {completedJobs.length > 0 ? (
        <div className="space-y-4">
          {completedJobs.map((job) => {
            const { active, suspended, canceled } = getJobBreakdown(job);
            const total = job.totalRecords;
            const fileSizeKb = (job.fileSize / 1024).toFixed(1);
            
            // Format duration in seconds
            const startTime = new Date(job.createdAt).getTime();
            const endTime = job.completedAt ? new Date(job.completedAt).getTime() : startTime;
            const durationSecs = ((endTime - startTime) / 1000).toFixed(1);

            return (
              <div 
                key={job.id} 
                className="bg-white border border-slate-200 hover:border-slate-350 rounded-lg p-4 shadow-sm transition-all flex flex-col lg:flex-row lg:items-center justify-between gap-4 relative group"
              >
                {/* File Core Details */}
                <div className="flex items-start gap-3 lg:max-w-md">
                  <div className="p-2.5 bg-slate-50 border border-slate-150 text-slate-500 rounded-md group-hover:bg-blue-50 group-hover:text-blue-600 group-hover:border-blue-100 transition-all shrink-0">
                    <FileSpreadsheet className="h-5 w-5" />
                  </div>
                  <div className="space-y-1 truncate">
                    <h3 className="text-xs font-bold text-slate-800 truncate" title={job.fileName}>
                      {job.fileName}
                    </h3>
                    <div className="flex flex-wrap items-center gap-3 text-[10px] text-slate-400 font-mono">
                      <span className="flex items-center gap-1">
                        <Calendar className="h-3 w-3 text-slate-400" />
                        {new Date(job.createdAt).toLocaleString('es-CO')}
                      </span>
                      <span className="flex items-center gap-1">
                        <Layers className="h-3 w-3 text-slate-400" />
                        {fileSizeKb} KB
                      </span>
                      <span className="flex items-center gap-1">
                        <Clock className="h-3 w-3 text-slate-400" />
                        En {durationSecs}s
                      </span>
                    </div>
                  </div>
                </div>

                {/* Statistics Breakdown and Visual Bar Chart */}
                <div className="flex-1 max-w-lg space-y-2">
                  <div className="flex items-center justify-between text-[11px] font-mono">
                    <div className="flex items-center gap-3">
                      <span className="flex items-center gap-1">
                        <CheckCircle className="h-3.5 w-3.5 text-emerald-500" />
                        <strong className="text-slate-800">{active}</strong> <span className="text-slate-400 uppercase text-[9px]">Activo</span>
                      </span>
                      <span className="flex items-center gap-1">
                        <AlertTriangle className="h-3.5 w-3.5 text-amber-500" />
                        <strong className="text-slate-800">{suspended}</strong> <span className="text-slate-400 uppercase text-[9px]">Sanción</span>
                      </span>
                      <span className="flex items-center gap-1">
                        <XSquare className="h-3.5 w-3.5 text-rose-500" />
                        <strong className="text-slate-800">{canceled}</strong> <span className="text-slate-400 uppercase text-[9px]">Cancelado</span>
                      </span>
                    </div>
                    <span className="text-slate-400 uppercase font-bold text-[8px] bg-slate-50 border border-slate-205 px-1.5 py-0.5 rounded">
                      EXITOSO
                    </span>
                  </div>

                  {/* Visual colored segmentation progress bar */}
                  <div className="w-full h-1.5 rounded-full bg-slate-100 flex overflow-hidden border border-slate-205">
                    <div 
                      className="bg-emerald-500 h-full transition-all duration-300"
                      style={{ width: `${(active / total) * 100}%` }}
                      title={`Activos: ${active}`}
                    />
                    <div 
                      className="bg-amber-400 h-full transition-all duration-300"
                      style={{ width: `${(suspended / total) * 100}%` }}
                      title={`Suspendidos / Inactivos: ${suspended}`}
                    />
                    <div 
                      className="bg-rose-500 h-full transition-all duration-300"
                      style={{ width: `${(canceled / total) * 100}%` }}
                      title={`Cancelados: ${canceled}`}
                    />
                  </div>
                </div>

                {/* Operations Column */}
                <div className="flex items-center gap-2 shrink-0 self-end lg:self-center">
                  <button
                    id={`download-job-history-${job.id}`}
                    onClick={() => downloadJobExcel(job.id)}
                    className="flex items-center gap-1 px-3 py-1.5 bg-slate-900 hover:bg-slate-850 text-white rounded text-[11px] font-bold font-mono transition-all"
                  >
                    <Download className="h-3.5 w-3.5" />
                    <span>Descargar Reporte</span>
                  </button>
                  <button
                    id={`delete-job-history-${job.id}`}
                    onClick={() => deleteJob(job.id)}
                    className="p-1.5 bg-rose-50 hover:bg-rose-100 text-rose-600 rounded border border-rose-100 hover:border-rose-200 transition-colors"
                    title="Eliminar este lote de la base de datos"
                  >
                    <Trash2 className="h-4 w-4" />
                  </button>
                </div>

              </div>
            );
          })}
        </div>
      ) : (
        <div className="h-80 flex flex-col items-center justify-center border-2 border-dashed border-slate-200 rounded-2xl text-center p-6 bg-white shadow-sm">
          <Database className="h-10 w-10 text-slate-300 mb-3.5 animate-pulse" />
          <h3 className="text-sm font-bold text-slate-800">Historial Vacío</h3>
          <p className="text-xs text-slate-500 max-w-sm mt-1.5 leading-relaxed">
            Aún no se registran lotes guardados en la base de datos local. Suba un archivo en la sección Validar Lotes para persistir sus consultas de manera permanente.
          </p>
        </div>
      )}

      {/* Security alert block */}
      <div className="p-4 bg-slate-50 border border-slate-200 rounded-2xl flex gap-3.5 items-start">
        <Sparkles className="h-5 w-5 text-sky-500 shrink-0 mt-0.5" />
        <div className="space-y-1">
          <h4 className="text-xs font-bold text-slate-800 uppercase font-mono">Auditoría de Consultas Guardadas</h4>
          <p className="text-xs text-slate-500 leading-relaxed">
            Todos los lotes procesados por su organización quedan protegidos y listos para consulta interna de cumplimiento tributario. Esto facilita auditorías rápidas frente a requerimientos de la DIAN.
          </p>
        </div>
      </div>

    </div>
  );
};
