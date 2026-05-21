import React, { useState } from 'react';
import { useDianRut } from '../context/DianRutContext';
import { calculateDV } from '../lib/dian';
import { ValidationRecord } from '../types';
import { 
  Building2, 
  CheckCircle, 
  AlertTriangle, 
  XSquare, 
  Search, 
  Cpu, 
  Clock, 
  ChevronRight, 
  Download,
  Calendar,
  Layers,
  Sparkles
} from 'lucide-react';

export const DashboardView: React.FC = () => {
  const { stats, jobs, validateSingleNit, downloadJobExcel } = useDianRut();
  
  // Single Lookup Local States
  const [searchNit, setSearchNit] = useState('');
  const [isSearching, setIsSearching] = useState(false);
  const [lookupResult, setLookupResult] = useState<ValidationRecord | null>(null);
  const [lookupError, setLookupError] = useState('');

  // Global Filter States across all processed jobs
  const [globalFilter, setGlobalFilter] = useState('');
  const [selectedStatus, setSelectedStatus] = useState<string>('TODOS');

  // Compute validation mathematically in real-time as user types
  const computedDv = searchNit ? calculateDV(searchNit) : '';

  // Get all unique records across all successfully completed jobs
  const allRecords: ValidationRecord[] = [];
  jobs.forEach(job => {
    if (job.status === 'COMPLETED' && job.records) {
      allRecords.push(...job.records);
    }
  });

  // Filter records based on global filter and selected status
  const filteredRecords = allRecords.filter(rec => {
    const query = globalFilter.toLowerCase().trim();
    const matchesQuery = !query || 
      rec.nit.includes(query) || 
      rec.companyName.toLowerCase().includes(query) ||
      rec.economicActivity.includes(query) ||
      (rec.activityName && rec.activityName.toLowerCase().includes(query)) ||
      (rec.dpto && rec.dpto.toLowerCase().includes(query));

    const matchesStatus = selectedStatus === 'TODOS' || rec.status === selectedStatus;
    return matchesQuery && matchesStatus;
  });

  const handleSingleLookup = async (e: React.FormEvent) => {
    e.preventDefault();
    const cleanNit = searchNit.replace(/[^0-9]/g, '');
    if (!cleanNit) {
      setLookupError('Por favor ingrese un NIT válido (solo números).');
      return;
    }
    
    setIsSearching(true);
    setLookupError('');
    setLookupResult(null);

    try {
      const result = await validateSingleNit(cleanNit);
      setLookupResult(result);
    } catch (err) {
      setLookupError('Error consultando el portal DIAN. Intente de nuevo.');
    } finally {
      setIsSearching(false);
    }
  };

  return (
    <div className="space-y-8 animate-fade-in">
      
      {/* Title & Time Column */}
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
        <div>
          <h2 className="text-2xl font-bold text-slate-900 tracking-tight">Consola de Estado DIAN</h2>
          <p className="text-sm text-slate-500">
            Validador masivo y extractor sincronizado con bases tributarias de la DIAN en Colombia.
          </p>
        </div>
        <div className="flex items-center gap-3 bg-white p-3 border border-slate-200 rounded-xl shadow-sm text-xs text-slate-500 font-mono">
          <Calendar className="h-4 w-4 text-sky-500" />
          <span className="font-semibold text-slate-700">Tiempo Bogotá:</span>
          <span>{new Date().toLocaleString('es-CO', { timeZone: 'America/Bogota' })}</span>
        </div>
      </div>

      {/* Grid Status Statistics Cards */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4 select-none">
        
        {/* Card 1: Total NITs */}
        <div className="bg-white p-4 rounded-lg border border-slate-200 shadow-sm transition-all hover:bg-slate-50/50">
          <p className="text-[10px] font-bold text-slate-500 uppercase tracking-widest">NITs Totales Procesados</p>
          <p className="text-2xl font-bold text-slate-800 mt-1">{stats.totalProcessed.toLocaleString()}</p>
          <p className="text-xs text-green-600 font-medium mt-1">En {jobs.length} lotes de consulta</p>
        </div>

        {/* Card 2: Active RUTs */}
        <div className="bg-white p-4 rounded-lg border border-slate-200 shadow-sm transition-all hover:bg-slate-50/50">
          <p className="text-[10px] font-bold text-slate-500 uppercase tracking-widest">RUTs Estado Activo</p>
          <p className="text-2xl font-bold text-slate-800 mt-1">{stats.activeCount.toLocaleString()}</p>
          <p className="text-xs text-slate-400 mt-1">
            {stats.totalProcessed ? ((stats.activeCount / stats.totalProcessed) * 100).toFixed(1) : '0.0'}% del gran total
          </p>
        </div>

        {/* Card 3: Suspended / Inactive RUTs */}
        <div className="bg-white p-4 rounded-lg border border-slate-200 shadow-sm transition-all hover:bg-slate-50/50">
          <p className="text-[10px] font-bold text-slate-500 uppercase tracking-widest">Sanción / Suspendidos</p>
          <p className="text-2xl font-bold text-red-650 mt-1">{stats.suspendedCount.toLocaleString()}</p>
          <p className="text-xs text-red-400 mt-1">Requieren acción inmediata</p>
        </div>

        {/* Card 4: Cancelados */}
        <div className="bg-white p-4 rounded-lg border border-slate-200 shadow-sm transition-all hover:bg-slate-50/50">
          <p className="text-[10px] font-bold text-slate-500 uppercase tracking-widest">Sucesores / Cancelados</p>
          <p className="text-2xl font-bold text-slate-800 mt-1">{stats.canceledCount.toLocaleString()}</p>
          <p className="text-xs text-blue-600 font-medium mt-1">Entidades liquidadas DIAN</p>
        </div>

      </div>

      {/* Main Grid Content - Single Lookup & Global Statistics Layout */}
      <div className="grid grid-cols-1 lg:grid-cols-12 gap-6">
        
        {/* Left Column: Fast lookup (Interactive lookup helper) */}
        <div className="lg:col-span-4 bg-white p-5 border border-slate-200 rounded-2xl shadow-sm flex flex-col justify-between">
          <div>
            <div className="flex items-center gap-2 mb-3">
              <Sparkles className="h-5 w-5 text-sky-500" />
              <h3 className="text-base font-bold text-slate-900">Consulta RUT Directa</h3>
            </div>
            <p className="text-xs text-slate-500 mb-5">
              Ingrese el número NIT de cualquier persona natural o jurídica para calcular matemáticamente su DV y consultar su estado oficial DIAN.
            </p>

            <form onSubmit={handleSingleLookup} className="space-y-4">
              <div>
                <label className="block text-[11px] font-bold text-slate-600 uppercase font-mono mb-1">Número NIT (Sin DV)</label>
                <div className="relative">
                  <input
                    id="lookup-nit-input"
                    type="text"
                    placeholder="Ej. 900555666"
                    value={searchNit}
                    onChange={(e) => setSearchNit(e.target.value.replace(/[^0-9]/g, ''))}
                    className="w-full px-4 py-3 bg-slate-50 border border-slate-250 rounded-xl font-mono text-sm font-semibold text-slate-900 focus:outline-none focus:ring-2 focus:ring-sky-500/20 focus:bg-white"
                  />
                  {computedDv && (
                    <div className="absolute right-3 top-2 px-2 py-1 bg-slate-900 rounded-md flex items-center gap-1.5 text-[10px] text-sky-400 font-mono">
                      <span>DV:</span>
                      <strong className="text-white">{computedDv}</strong>
                    </div>
                  )}
                </div>
              </div>

              {lookupError && (
                <div className="p-3 bg-rose-50 border border-rose-200 rounded-xl text-xs text-rose-600 flex items-center gap-2">
                  <AlertTriangle className="h-4 w-4 shrink-0" />
                  <span>{lookupError}</span>
                </div>
              )}

              <button
                id="lookup-submit"
                type="submit"
                disabled={isSearching || !searchNit}
                className="w-full flex items-center justify-center gap-2 py-3 px-4 rounded-xl text-xs font-semibold text-white bg-slate-900 hover:bg-slate-800 disabled:bg-slate-200 disabled:text-slate-400 font-mono transition-colors"
              >
                {isSearching ? (
                  <>
                    <Cpu className="h-4 w-4 animate-spin" />
                    <span>Conectando a DIAN...</span>
                  </>
                ) : (
                  <>
                    <Search className="h-4 w-4" />
                    <span>CONSULTAR NIT: {searchNit || '...'}</span>
                  </>
                )}
              </button>
            </form>
          </div>

          {/* Lookup Result Panel */}
          <div className="mt-6 border-t border-dashed border-slate-200 pt-5">
            {lookupResult ? (
              <div className="bg-slate-50 p-4 border border-slate-200 rounded-xl space-y-3.5 animate-slide-up">
                
                {/* Result Top Row */}
                <div className="flex items-start justify-between">
                  <div className="truncate pr-2">
                    <p className="text-[10px] text-slate-400 font-mono">NIT {lookupResult.nit}-{lookupResult.dv}</p>
                    <h4 className="text-xs font-bold text-slate-800 truncate" title={lookupResult.companyName}>
                      {lookupResult.companyName}
                    </h4>
                  </div>
                  <span className={`px-2 py-1 text-[9px] font-bold rounded shrink-0 border uppercase font-mono ${
                    lookupResult.status === 'ACTIVO' 
                      ? 'bg-emerald-500/10 text-emerald-500 border-emerald-500/20' 
                      : lookupResult.status === 'SUSPENDIDO'
                      ? 'bg-amber-500/10 text-amber-500 border-amber-500/20'
                      : 'bg-rose-500/10 text-rose-500 border-rose-500/20'
                  }`}>
                    {lookupResult.status}
                  </span>
                </div>

                {/* Economic Activity */}
                <div className="text-xs space-y-1">
                  <span className="text-[9px] font-bold text-slate-400 uppercase font-mono">Actividad Económica</span>
                  <p className="text-slate-600 leading-snug">
                    <span className="font-mono font-bold text-slate-700">{lookupResult.economicActivity}</span> - {lookupResult.activityName}
                  </p>
                </div>

                {/* Location */}
                <div className="grid grid-cols-2 gap-2 text-[10px] bg-white p-2.5 rounded-lg border border-slate-200/60 font-mono">
                  <div>
                    <span className="text-slate-400 block">Ciudad:</span>
                    <span className="text-slate-700 font-semibold truncate block">{lookupResult.dpto}</span>
                  </div>
                  <div>
                    <span className="text-slate-400 block">Última Consulta:</span>
                    <span className="text-slate-700 font-semibold block">Hoy</span>
                  </div>
                </div>

                {/* Code verification security trace */}
                <div className="text-[9px] bg-slate-900 text-slate-400 p-2 rounded border border-slate-950 flex items-center justify-between font-mono">
                  <span>TRACER ID DIAN:</span>
                  <span className="text-sky-400 font-semibold">{lookupResult.checkCode.slice(0, 15)}...</span>
                </div>
              </div>
            ) : (
              <div className="h-40 flex flex-col items-center justify-center border border-dashed border-slate-200/70 rounded-xl text-center p-4">
                <Clock className="h-6 w-6 text-slate-300 animate-pulse mb-2" />
                <p className="text-xs text-slate-400">Sin consultas registradas en la presente sesión.</p>
              </div>
            )}
          </div>
        </div>

        {/* Right Column: Searchable Global Verification Records Database */}
        <div className="lg:col-span-8 bg-white p-5 border border-slate-200 rounded-2xl shadow-sm space-y-5">
          <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
            <div>
              <h3 className="text-base font-bold text-slate-900">Base de Datos de NITs Verificados</h3>
              <p className="text-xs text-slate-500">Historial de registros consultados en todos los lotes completados.</p>
            </div>
            
            <div className="flex items-center gap-2">
              <span className="text-xs font-mono text-slate-400 bg-slate-50 px-2.5 py-1.5 border border-slate-250 rounded-lg">
                Total en caché: <strong>{allRecords.length}</strong>
              </span>
            </div>
          </div>

          {/* Dynamic Filter Layout */}
          <div className="grid grid-cols-1 sm:grid-cols-12 gap-3.5">
            <div className="relative sm:col-span-8">
              <Search className="absolute left-3.5 top-3.5 h-4 w-4 text-slate-400" />
              <input
                id="global-db-search"
                type="text"
                placeholder="Filtrar por NIT, Razón Social, Actividad o Departamento..."
                value={globalFilter}
                onChange={(e) => setGlobalFilter(e.target.value)}
                className="w-full pl-10 pr-4 py-3 bg-slate-50 border border-slate-200 rounded-xl text-xs font-medium focus:outline-none focus:ring-2 focus:ring-sky-500/25 focus:bg-white"
              />
            </div>
            <div className="sm:col-span-4">
              <select
                id="global-db-status-filter"
                value={selectedStatus}
                onChange={(e) => setSelectedStatus(e.target.value)}
                className="w-full px-3 py-3 bg-slate-50 border border-slate-200 rounded-xl text-xs font-semibold text-slate-700 focus:outline-none focus:ring-2 focus:ring-sky-500/25"
              >
                <option value="TODOS">Todos los Estados</option>
                <option value="ACTIVO">Activo</option>
                <option value="SUSPENDIDO">Suspendido</option>
                <option value="INACTIVO">Inactivo</option>
                <option value="CANCELADO">Cancelado</option>
              </select>
            </div>
          </div>

          {/* Highly responsive interactive data sheet */}
          <div className="overflow-x-auto border border-slate-200/80 rounded-xl">
            <table className="min-w-full divide-y divide-slate-200 text-left">
              <thead className="bg-slate-50/70 text-slate-500 font-mono text-[10px] uppercase tracking-wider font-bold">
                <tr>
                  <th className="px-5 py-3.5">NIT - DV</th>
                  <th className="px-5 py-3.5">Razón Social o Contribuyente</th>
                  <th className="px-5 py-3.5">Estado RUT</th>
                  <th className="px-5 py-3.5">Fecha Validación</th>
                  <th className="px-5 py-3.5 text-right">Comprobante</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-200/60 text-xs">
                {filteredRecords.length > 0 ? (
                  filteredRecords.slice(0, 10).map((rec) => (
                    <tr key={rec.id} className="hover:bg-slate-50/50 transition-colors">
                      <td className="px-5 py-3.5 font-mono text-slate-900 font-bold">
                        {rec.nit}-{rec.dv}
                      </td>
                      <td className="px-5 py-3.5 truncate max-w-[200px]" title={rec.companyName}>
                        <div className="font-semibold text-slate-800">{rec.companyName}</div>
                        <div className="text-[10px] text-slate-400 truncate">{rec.activityName}</div>
                      </td>
                      <td className="px-5 py-3.5">
                        <span className={`px-2 py-0.5 text-[9px] font-bold font-mono rounded border ${
                          rec.status === 'ACTIVO' 
                            ? 'bg-emerald-500/10 text-emerald-600 border-emerald-500/25' 
                            : rec.status === 'SUSPENDIDO'
                            ? 'bg-amber-500/10 text-amber-600 border-amber-500/25'
                            : 'bg-rose-500/10 text-rose-600 border-rose-500/25'
                        }`}>
                          {rec.status}
                        </span>
                      </td>
                      <td className="px-5 py-3.5 text-slate-500 font-mono text-[10px]">
                        {new Date(rec.lastValidated).toLocaleDateString('es-CO')}
                      </td>
                      <td className="px-5 py-3.5 text-right">
                        <span className="text-[10px] font-mono font-bold text-sky-500 bg-sky-500/5 px-2 py-0.5 rounded border border-sky-500/10 hover:bg-sky-500/10 hover:border-sky-500/20 cursor-pointer" title={rec.checkCode}>
                          {rec.checkCode.slice(5, 12)}
                        </span>
                      </td>
                    </tr>
                  ))
                ) : (
                  <tr>
                    <td colSpan={5} className="text-center py-10 text-slate-400 text-xs">
                      No se encontraron registros de verificación que coincidan con los filtros aplicados.
                    </td>
                  </tr>
                )}
              </tbody>
            </table>
          </div>

          {filteredRecords.length > 10 && (
            <div className="text-center">
              <span className="text-[11px] text-slate-400 font-mono">
                Mostrando los 10 registros más recientes de {filteredRecords.length} totales filtados.
              </span>
            </div>
          )}

        </div>

      </div>

    </div>
  );
};
