/**
 * Official DIAN Colombian NIT Verification Digit (DV) Calculator
 * and mock DIAN RUT Scraper validation generator.
 */

// Primes weight array for DV computation (Right-to-Left weights)
const Multipliers = [3, 7, 13, 17, 19, 23, 29, 37, 41, 43, 47, 53, 59, 67, 71, 73, 79];

/**
 * Calculates the Colombian Verification Digit (DV) for a given NIT or Cédula.
 * Precise mathematical formula defined by the DIAN.
 */
export function calculateDV(nit: string | number): string {
  const clean = String(nit).replace(/[^0-9]/g, '');
  if (!clean) return '0';

  let sum = 0;
  const len = clean.length;

  for (let i = 0; i < len; i++) {
    const digit = parseInt(clean.charAt(len - 1 - i), 10);
    // Multipliers sequence corresponds to right-to-left index position
    const multiplier = Multipliers[i] || 3; // fallback if somehow longer
    sum += digit * multiplier;
  }

  const remainder = sum % 11;
  if (remainder < 2) {
    return String(remainder);
  }
  return String(11 - remainder);
}

// Prefixes for Colombian business or individuals
const BusinessPrefixes = [
  'Tecnología y Soluciones',
  'Inversiones',
  'Alimentos y Agro',
  'Comercializadora',
  'Grupo Logístico',
  'Distribuidora',
  'Consultores',
  'Constructora',
  'Servicios Integrales',
  'Textiles e Industrias',
  'Sistemas de Información',
  'Fiduciaria',
  'Transportes'
];

const BusinessCore = [
  'Andina',
  'del Caribe',
  'Suramericana',
  'Bogotá',
  'Paisa',
  'Bolívar',
  'Occidente',
  'Pacífico',
  'Nacional',
  'Futuro',
  'Oriente',
  'San Fernando',
  'Alianza',
  'Lider',
  'Innovación'
];

const BusinessSuffixes = ['S.A.S.', 'S.A.', 'Ltda.', 'e Hijos S.C.A.', 'e.u.'];

const PersonFirstNames = [
  'Carlos', 'María', 'Juan', 'Ana', 'Luis', 'Diana', 'Jorge', 'Sandra', 'Andrés', 'Gloria',
  'Fernando', 'Patricia', 'Pedro', 'Martha', 'José', 'Adriana', 'David', 'Liliana', 'Mauricio'
];

const PersonLastNames = [
  'Gómez', 'Rodríguez', 'González', 'Martínez', 'López', 'Gutiérrez', 'Hernández', 'Díaz',
  'Pérez', 'Sánchez', 'Ramírez', 'Muñoz', 'Ríos', 'Castillo', 'Torres', 'Vargas', 'Rojas'
];

const EconomicActivities = [
  { code: '6201', name: 'Desarrollo de sistemas de informática (planificación, análisis, diseño, programación pruebas)' },
  { code: '4690', name: 'Comercio al por mayor no especializado' },
  { code: '1089', name: 'Elaboración de otros productos alimenticios n.c.p.' },
  { code: '4111', name: 'Construcción de edificios residenciales' },
  { code: '6910', name: 'Actividades jurídicas' },
  { code: '6920', name: 'Actividades de contabilidad, teneduría de libros, auditoría e impuestos' },
  { code: '8610', name: 'Actividades de hospitales y clínicas con internación' },
  { code: '7110', name: 'Actividades de arquitectura e ingeniería y otras actividades conexas' },
  { code: '4711', name: 'Comercio al por menor en establecimientos no especializados con surtido compuesto principalmente por alimentos, bebidas' },
  { code: '5611', name: 'Expendio a la mesa de comidas preparadas' },
  { code: '4923', name: 'Transporte de carga por carretera' },
  { code: '6419', name: 'Otros tipos de intermediación monetaria' },
  { code: '1101', name: 'Destilación, rectificación y mezcla de bebidas alcohólicas' },
  { code: '1410', name: 'Confección de prendas de vestir, excepto prendas de piel' }
];

const Departamentos = [
  { name: 'Bogotá D.C.', dpto: 'Cundinamarca' },
  { name: 'Medellín', dpto: 'Antioquia' },
  { name: 'Cali', dpto: 'Valle del Cauca' },
  { name: 'Barranquilla', dpto: 'Atlántico' },
  { name: 'Bucaramanga', dpto: 'Santander' },
  { name: 'Cartagena', dpto: 'Bolívar' },
  { name: 'Pereira', dpto: 'Risaralda' },
  { name: 'Manizales', dpto: 'Caldas' },
  { name: 'Cúcuta', dpto: 'Norte de Santander' },
  { name: 'Ibagué', dpto: 'Tolima' },
  { name: 'Villavicencio', dpto: 'Meta' }
];

/**
 * Generates highly realistic DIAN RUT registration record based on a NIT or Cédula.
 */
export function generateMockResult(nitNum: string): {
  companyName: string;
  dv: string;
  status: 'ACTIVO' | 'SUSPENDIDO' | 'INACTIVO' | 'CANCELADO';
  activityCode: string;
  activityName: string;
  address: string;
  dpto: string;
  notes: string;
} {
  const cleanNit = nitNum.replace(/[^0-9]/g, '');
  const dv = calculateDV(cleanNit);
  
  // Hash implementation to keep the same NIT generating the same output
  let hash = 0;
  for (let i = 0; i < cleanNit.length; i++) {
    hash = cleanNit.charCodeAt(i) + ((hash << 5) - hash);
  }
  const absHash = Math.abs(hash);

  const isBusiness = cleanNit.length >= 9 && (cleanNit.startsWith('8') || cleanNit.startsWith('9'));
  
  let companyName = '';
  if (isBusiness) {
    const pref = BusinessPrefixes[absHash % BusinessPrefixes.length];
    const core = BusinessCore[(absHash >> 1) % BusinessCore.length];
    const suff = BusinessSuffixes[(absHash >> 2) % BusinessSuffixes.length];
    companyName = `${pref} ${core} ${suff}`;
  } else {
    const first1 = PersonFirstNames[absHash % PersonFirstNames.length];
    const first2 = absHash % 3 === 0 ? ` ${PersonFirstNames[(absHash >> 3) % PersonFirstNames.length]}` : '';
    const last1 = PersonLastNames[(absHash >> 1) % PersonLastNames.length];
    const last2 = PersonLastNames[(absHash >> 2) % PersonLastNames.length];
    companyName = `${first1}${first2} ${last1} ${last2}`;
  }

  // 85% Active, 10% Suspended, 3% Inactive, 2% Canceled
  const statusRoll = absHash % 100;
  let status: 'ACTIVO' | 'SUSPENDIDO' | 'INACTIVO' | 'CANCELADO' = 'ACTIVO';
  let notes = 'La consulta RUT arrojó coincidencia exacta con registros de la DIAN.';
  
  if (statusRoll < 85) {
    status = 'ACTIVO';
  } else if (statusRoll < 93) {
    status = 'SUSPENDIDO';
    notes = 'RUT SUSPENDIDO temporalmente. Requiere actualización de datos de contacto o firma electrónica en DIAN.';
  } else if (statusRoll < 97) {
    status = 'INACTIVO';
    notes = 'RUT INACTIVO. El contribuyente no registra movimientos comerciales ni reporte tributario en el periodo vigente.';
  } else {
    status = 'CANCELADO';
    notes = 'RUT CANCELADO. Liquidación definitiva o fusión de persona jurídica/sucesión ilíquida registrada ante Cámara de Comercio.';
  }

  const activity = EconomicActivities[absHash % EconomicActivities.length];
  const location = Departamentos[absHash % Departamentos.length];
  
  const streetTypes = ['Calle', 'Carrera', 'Avenida', 'Diagonal', 'Transversal'];
  const streetType = streetTypes[absHash % streetTypes.length];
  const streetNum = (absHash % 120) + 1;
  const houseNum = (absHash % 90) + 1;
  const detailsNum = (absHash % 99) + 1;
  
  const address = `${streetType} ${streetNum} # ${houseNum} - ${detailsNum} Of. ${100 + (absHash % 899)}`;
  const dptoDisplay = `${location.name}, ${location.dpto}`;

  return {
    companyName,
    dv,
    status,
    activityCode: activity.code,
    activityName: activity.name,
    address,
    dpto: dptoDisplay,
    notes
  };
}

/**
 * Creates step-by-step progress simulation events for high fidelity log console
 */
export function getValidationSteps(nit: string, index: number, total: number): { text: string; time: number }[] {
  const formattedIndex = `${index + 1}/${total}`;
  return [
    { text: `[${formattedIndex}] Estableciendo conexión segura con Muisca DIAN (portal.dian.gov.co)...`, time: 50 },
    { text: `[${formattedIndex}] Enviando cabeceras HTTPS y resolviendo token criptográfico de sesión...`, time: 120 },
    { text: `[${formattedIndex}] Ejecutando consulta NIT ${nit} en base de datos única de RUT...`, time: 230 },
    { text: `[${formattedIndex}] Extrayendo Código de Actividad, Representación Legal y Estado RUT...`, time: 380 },
    { text: `[${formattedIndex}] Verificación matemática de Dígito de Control exitosa. RUT validado satisfactoriamente.`, time: 480 }
  ];
}
