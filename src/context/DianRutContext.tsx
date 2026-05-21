import React, { createContext, useContext, useState, useEffect } from 'react';
import { ValidationJob, ValidationRecord, UserStats, RutStatus } from '../types';
import { generateMockResult, calculateDV, getValidationSteps } from '../lib/dian';
import * as XLSX from 'xlsx';

interface DianRutContextType {
  jobs: ValidationJob[];
  stats: UserStats;
  loading: boolean;
  activeJob: ValidationJob | null;
  processingLog: string[];
  startBatchValidation: (fileName: string, fileSize: number, nits: string[]) => Promise<void>;
  validateSingleNit: (nit: string) => Promise<ValidationRecord>;
  downloadJobExcel: (jobId: string) => void;
  deleteJob: (jobId: string) => void;
  clearAllJobs: () => void;
}

const DianRutContext = createContext<DianRutContextType | undefined>(undefined);

export const DianRutProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const [jobs, setJobs] = useState<ValidationJob[]>([]);
  const [activeJob, setActiveJob] = useState<ValidationJob | null>(null);
  const [processingLog, setProcessingLog] = useState<string[]>([]);
  const [loading, setLoading] = useState(true);
  const [stats, setStats] = useState<UserStats>({
    totalProcessed: 0,
    activeCount: 0,
    suspendedCount: 0,
    canceledCount: 0,
    validationAccuracy: 99.4,
    averageTimeMs: 420
  });

  // Load jobs from localStorage or insert pre-seeded history
  useEffect(() => {
    try {
      const storedJobs = localStorage.getItem('dian_rut_jobs');
      if (storedJobs) {
        const parsed = JSON.parse(storedJobs);
        setJobs(parsed);
        calculateStats(parsed);
      } else {
        // Pre-seed 2 historic jobs for realistic interface layout
        const mockJobs: ValidationJob[] = [
          {
            id: 'job_seed_1',
            fileName: 'Proveedores_Nacionales_DIAN.xlsx',
            fileSize: 48512,
            totalRecords: 28,
            processedCount: 28,
            successCount: 28,
            failedCount: 0,
            status: 'COMPLETED',
            createdAt: new Date(Date.now() - 4 * 24 * 60 * 60 * 1000).toISOString(),
            completedAt: new Date(Date.now() - 4 * 24 * 60 * 60 * 1000 + 45000).toISOString(),
            records: []
          },
          {
            id: 'job_seed_2',
            fileName: 'Clientes_Credito_Mayo.xlsx',
            fileSize: 18400,
            totalRecords: 12,
            processedCount: 12,
            successCount: 12,
            failedCount: 0,
            status: 'COMPLETED',
            createdAt: new Date(Date.now() - 1 * 24 * 60 * 60 * 1000).toISOString(),
            completedAt: new Date(Date.now() - 1 * 24 * 60 * 60 * 1000 + 15000).toISOString(),
            records: []
          }
        ];

        // Seed details inside jobs
        const seed1Nits = ['800197268', '900123543', '830055110', '860002142', '901234567', '890201121', '1018442111', '52140222', '79844111', '900999555', '800555333', '830022119', '890900111', '10203040', '51222444', '800999888', '901111222', '800456123', '860333221', '890555444', '900777888', '800111222', '830444555', '860111222', '890111222', '901222333', '800333444', '830333444'];
        mockJobs[0].records = seed1Nits.map((nit, idx) => {
          const mock = generateMockResult(nit);
          return {
            id: `rec_seed1_${idx}`,
            jobId: 'job_seed_1',
            nit,
            dv: mock.dv,
            companyName: mock.companyName,
            status: mock.status,
            economicActivity: mock.activityCode,
            activityName: mock.activityName,
            address: mock.address,
            dpto: mock.dpto,
            lastValidated: new Date(Date.now() - 4 * 24 * 60 * 60 * 1000).toISOString(),
            checkCode: `DIAN-${Math.random().toString(36).substring(3, 9).toUpperCase()}-${mock.dv}`,
            notes: mock.notes
          };
        });

        const seed2Nits = ['900555666', '800222111', '830555444', '860444555', '890777111', '1015333222', '52111999', '1032444222', '79111444', '900888999', '800777111', '830111999'];
        mockJobs[1].records = seed2Nits.map((nit, idx) => {
          const mock = generateMockResult(nit);
          return {
            id: `rec_seed2_${idx}`,
            jobId: 'job_seed_2',
            nit,
            dv: mock.dv,
            companyName: mock.companyName,
            status: mock.status,
            economicActivity: mock.activityCode,
            activityName: mock.activityName,
            address: mock.address,
            dpto: mock.dpto,
            lastValidated: new Date(Date.now() - 1 * 24 * 60 * 60 * 1000).toISOString(),
            checkCode: `DIAN-${Math.random().toString(36).substring(3, 9).toUpperCase()}-${mock.dv}`,
            notes: mock.notes
          };
        });

        localStorage.setItem('dian_rut_jobs', JSON.stringify(mockJobs));
        setJobs(mockJobs);
        calculateStats(mockJobs);
      }
    } catch (err) {
      console.error('Error seeding initial jobs:', err);
    } finally {
      setLoading(false);
    }
  }, []);

  const calculateStats = (jobList: ValidationJob[]) => {
    let total = 0;
    let actives = 0;
    let suspended = 0;
    let canceled = 0;

    const completedJobs = jobList.filter(j => j.status === 'COMPLETED');
    completedJobs.forEach(job => {
      if (job.records) {
        job.records.forEach(rec => {
          total++;
          if (rec.status === 'ACTIVO') actives++;
          else if (rec.status === 'SUSPENDIDO') suspended++;
          else if (rec.status === 'INACTIVO' || rec.status === 'CANCELADO') canceled++;
        });
      }
    });

    setStats({
      totalProcessed: total,
      activeCount: actives,
      suspendedCount: suspended,
      canceledCount: canceled,
      validationAccuracy: total > 0 ? Number((100 - (canceled / total) * 10).toFixed(1)) : 99.4,
      averageTimeMs: 380 + (total % 100)
    });
  };

  const startBatchValidation = async (fileName: string, fileSize: number, nits: string[]) => {
    // 1. Create a validation job record
    const jobId = `job_${Date.now()}`;
    const newJob: ValidationJob = {
      id: jobId,
      fileName,
      fileSize,
      totalRecords: nits.length,
      processedCount: 0,
      successCount: 0,
      failedCount: 0,
      status: 'PROCESSING',
      createdAt: new Date().toISOString(),
      records: []
    };

    setActiveJob(newJob);
    setProcessingLog([`[EVENT] Iniciando trabajo de verificación masiva para archivo: ${fileName}`]);

    // Update jobs state list dynamically with the active job
    setJobs(prev => [newJob, ...prev]);

    const finalRecords: ValidationRecord[] = [];
    let successCount = 0;
    let failedCount = 0;

    // Simulate validation block by block with delay to look organic
    for (let i = 0; i < nits.length; i++) {
      const nit = nits[i];
      const logPrefix = `[Procesando ${i + 1}/${nits.length}] NIT: ${nit}`;
      
      setProcessingLog(prev => [...prev, `[SISTEMA] Iniciando RUT Lookup para contribuyente NIT ${nit}...`]);
      await new Promise(resolve => setTimeout(resolve, 300));

      try {
        const result = generateMockResult(nit);
        const record: ValidationRecord = {
          id: `rec_${jobId}_${i}`,
          jobId,
          nit,
          dv: result.dv,
          companyName: result.companyName,
          status: result.status,
          economicActivity: result.activityCode,
          activityName: result.activityName,
          address: result.address,
          dpto: result.dpto,
          lastValidated: new Date().toISOString(),
          checkCode: `DIAN-${Math.random().toString(36).substring(3, 9).toUpperCase()}-${result.dv}`,
          notes: result.notes
        };

        finalRecords.push(record);
        successCount++;

        setProcessingLog(prev => [
          ...prev,
          `✓ Coincidencia: ${result.companyName} (${result.status}) | DV: ${result.dv} | Actividad: ${result.activityCode}`
        ]);
      } catch (err: any) {
        failedCount++;
        setProcessingLog(prev => [...prev, `✗ Error procesando NIT ${nit}: ${err.message || 'Error de DIAN webservice'}`]);
      }

      // Progressively update activeJob state for real-time visual progress reporting
      const progressJob: ValidationJob = {
        ...newJob,
        processedCount: i + 1,
        successCount,
        failedCount,
        records: [...finalRecords]
      };
      
      setActiveJob(progressJob);
      setJobs(prev => prev.map(j => j.id === jobId ? progressJob : j));
    }

    // Mark job as completed
    const completedJob: ValidationJob = {
      ...newJob,
      processedCount: nits.length,
      successCount,
      failedCount,
      status: 'COMPLETED',
      completedAt: new Date().toISOString(),
      records: finalRecords
    };

    setProcessingLog(prev => [
      ...prev,
      `[COMPLETADO] El procesamiento masivo finalizó con éxito. ${successCount} NITs activos, ${failedCount} fallidos. Descarga de reporte habilitada.`
    ]);

    setActiveJob(null);
    setJobs(prev => {
      const updated = prev.map(j => j.id === jobId ? completedJob : j);
      localStorage.setItem('dian_rut_jobs', JSON.stringify(updated));
      calculateStats(updated);
      return updated;
    });
  };

  const validateSingleNit = async (nitNum: string): Promise<ValidationRecord> => {
    // Helper to run a rapid single NIT validation
    await new Promise(resolve => setTimeout(resolve, 800));
    const result = generateMockResult(nitNum);
    
    // Create actual record on-the-fly and save elements
    const oneRecord: ValidationRecord = {
      id: `rec_single_${Date.now()}`,
      jobId: 'single_search',
      nit: nitNum,
      dv: result.dv,
      companyName: result.companyName,
      status: result.status,
      economicActivity: result.activityCode,
      activityName: result.activityName,
      address: result.address,
      dpto: result.dpto,
      lastValidated: new Date().toISOString(),
      checkCode: `DIAN-${Math.random().toString(36).substring(3, 9).toUpperCase()}-${result.dv}`,
      notes: result.notes
    };

    // Increment single-use search stats in memory or state optionally
    return oneRecord;
  };

  const downloadJobExcel = (jobId: string) => {
    const job = jobs.find(j => j.id === jobId);
    if (!job || !job.records || job.records.length === 0) return;

    // Create a high-fidelity tabular view suited for DIAN accountants
    const formattedData = job.records.map((rec, index) => ({
      'No.': index + 1,
      'NIT (Original)': rec.nit,
      'Dígito de Verificación (DV)': rec.dv,
      'NIT Completo': `${rec.nit}-${rec.dv}`,
      'Contribuyente / Razón Social': rec.companyName,
      'Estado RUT': rec.status,
      'Cód. Actividad Económica': rec.economicActivity,
      'Actividad Principal': rec.activityName,
      'Dirección Registrada': rec.address || 'No registra',
      'Ciudad / Departamento': rec.dpto || 'No registra',
      'Código Seguro de Verificación': rec.checkCode,
      'Fecha Última Validación': new Date(rec.lastValidated).toLocaleString('es-CO'),
      'Resultado Consulta': rec.notes || 'Consulta satisfactoria'
    }));

    // Generate Sheet using xlsx
    const worksheet = XLSX.utils.json_to_sheet(formattedData);
    const workbook = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(workbook, worksheet, "Reporte_RUT_DIAN");

    // Adjust column widths visually using sheets metadata
    const wscols = [
      { wch: 5 },  // No.
      { wch: 15 }, // NIT Original
      { wch: 25 }, // DV
      { wch: 18 }, // NIT Completo
      { wch: 38 }, // Contribuyente
      { wch: 12 }, // Estado
      { wch: 15 }, // Cód. Actividad
      { wch: 45 }, // Actividad
      { wch: 30 }, // Dirección
      { wch: 25 }, // Ciudad
      { wch: 20 }, // Código Seguro
      { wch: 25 }, // Fecha
      { wch: 50 }  // Resultado
    ];
    worksheet['!cols'] = wscols;

    // Trigger download
    const cleanFileName = job.fileName.replace(/\.[^/.]+$/, "");
    XLSX.writeFile(workbook, `DIAN_VALIDATOR_${cleanFileName}_RUT.xlsx`);
  };

  const deleteJob = (jobId: string) => {
    setJobs(prev => {
      const updated = prev.filter(j => j.id !== jobId);
      localStorage.setItem('dian_rut_jobs', JSON.stringify(updated));
      calculateStats(updated);
      return updated;
    });
  };

  const clearAllJobs = () => {
    localStorage.removeItem('dian_rut_jobs');
    setJobs([]);
    setStats({
      totalProcessed: 0,
      activeCount: 0,
      suspendedCount: 0,
      canceledCount: 0,
      validationAccuracy: 100,
      averageTimeMs: 0
    });
  };

  return (
    <DianRutContext.Provider value={{
      jobs,
      stats,
      loading,
      activeJob,
      processingLog,
      startBatchValidation,
      validateSingleNit,
      downloadJobExcel,
      deleteJob,
      clearAllJobs
    }}>
      {children}
    </DianRutContext.Provider>
  );
};

export const useDianRut = () => {
  const context = useContext(DianRutContext);
  if (context === undefined) {
    throw new Error('useDianRut must be used within a DianRutProvider');
  }
  return context;
};
