export type RutStatus = 'ACTIVO' | 'SUSPENDIDO' | 'INACTIVO' | 'CANCELADO';

export interface User {
  id: string;
  email: string;
  fullName: string;
  companyName?: string;
  role: 'admin' | 'user';
  createdAt: string;
}

export interface ValidationRecord {
  id: string;
  jobId: string;
  nit: string;
  dv: string; // mathematical verification digit
  companyName: string;
  status: RutStatus;
  economicActivity: string; // e.g. "4690", "6201"
  activityName: string; // e.g. "Comercio al por mayor no especializado", "Desarrollo de sistemas de informática"
  address?: string;
  dpto?: string; // Departamento, e.g., Cundinamarca, Antioquia
  lastValidated: string;
  checkCode: string; // UUID or Verification Token from pseudo-DIAN query
  notes?: string;
}

export interface ValidationJob {
  id: string;
  fileName: string;
  fileSize: number;
  totalRecords: number;
  processedCount: number;
  successCount: number;
  failedCount: number;
  status: 'PENDING' | 'PROCESSING' | 'COMPLETED' | 'FAILED';
  createdAt: string;
  completedAt?: string;
  records?: ValidationRecord[];
}

export interface UserStats {
  totalProcessed: number;
  activeCount: number;
  suspendedCount: number;
  canceledCount: number;
  validationAccuracy: number; // calculated rating or metric
  averageTimeMs: number;
}
