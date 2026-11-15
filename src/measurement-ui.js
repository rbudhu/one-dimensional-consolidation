import {BALANCE_FIELDS,appliedLoad} from './measurements.js';
import {analysisMeasurements} from './physics.js';
export const MEASUREMENT_FIELDS=Object.freeze([
 ['ringGlassTareG','Ring + wrapped plate tare','g',1],
 ['diameterM','Ring inner diameter','mm',1000],
 ['initialHeightM','Ring height','mm',1000],
 ['aliquotTareG','Initial moisture can tare','g',1],
 ['aliquotWetCanG','Can + wet aliquot','g',1],
 ['aliquotDryCanG','Can + dry aliquot','g',1],
 ['aliquotDryingMinutes','Aliquot oven duration','min',1],
 ['pycnometerDrySoilG','Pycnometer dry solids','g',1],
 ['pycnometerWaterG','Bottle + water','g',1],
 ['pycnometerSoilWaterG','Bottle + solids + water','g',1],
 ['initialWetAssemblyG','Initial wet ring + plate + soil','g',1],
 ['finalWetAssemblyG','Final wet ring + plate + soil','g',1],
 ['finalHeightM','Final specimen height','mm',1000],
 ['finalCanTareG','Final can + lid tare','g',1],
 ['finalDryCanG','Final can + dry soil','g',1],
]);
export function measurementRows(state){
 const rows=MEASUREMENT_FIELDS.map(([field,name,unit,factor])=>({field,name,unit,value:Number.isFinite(state.measurements?.[field]) ? state.measurements[field]*factor : null,derived:false}));
 const derived=analysisMeasurements(state);
 for(const [field,name,unit,factor] of [['w0','Initial moisture','%',100],['wf','Final moisture','%',100],['Gs','Solids specific gravity','',1],['dryMassG','Dry soil solids','g',1]])
  rows.push({field,name,unit,value:Number.isFinite(derived[field]) ? derived[field]*factor : null,derived:true});
 return rows;
}
export function latestMeasurement(state){
 for(const h of [...(state.history||[])].reverse()){
  const fields=Object.keys(h.measurements||{}),field=BALANCE_FIELDS[h.actionId] || fields.find(f=>MEASUREMENT_FIELDS.some(([key])=>key===f));
  const row=measurementRows({measurements:h.measurements}).find(r=>r.field===field && r.value!==null);
  if(row)return {...row,actionId:h.actionId};
 }
 return null;
}
export function caliperMeasurement(state){
 for(const h of [...(state.history||[])].reverse()){
  const field=h.actionId==='measure-height' ? 'initialHeightM' : h.actionId==='measure-diameter' ? 'diameterM' : null;
  if(field && Number.isFinite(h.measurements?.[field]))return {field,value:h.measurements[field]*1000,unit:'mm'};
 }
 return null;
}
export function liveMeasurements(state){
 const load=appliedLoad(state),m=state.model;
 return {pressureTsf:m ? load.pressureTsf : null,pressureKPa:m ? load.pressureKPa : null,dial:m?.dialDivisions??null,settlement:m?.settlementMm??null,minutes:m ? state.elapsedMinutes??0 : null,status:load.released ? 'Released · last loaded reading frozen' : m ? 'Live virtual loading' : 'Awaiting loading'};
}
