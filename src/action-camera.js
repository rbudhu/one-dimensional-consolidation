export function actionStation(task){
 if(task?.targetId==='balance' || task?.id==='weigh-dry')return 'balance';
 if(['oven-place','dry-oven','aliquot-dry'].includes(task?.id))return 'oven';
 if(['record-reading','next-increment','flood','center-cap','adjust-contact','zero-dial','release-load','lower-assembly'].includes(task?.id))return 'cell';
 if(['transfer-soil','weigh-can'].includes(task?.id))return 'can-final';
 if(['measure-diameter','measure-height'].includes(task?.id))return 'caliper';
 if(['soak-stones','bottom-stone','bottom-filter','place-ring','top-filter','top-stone'].includes(task?.id))return 'assembly';
 return 'trim';
}
// Owns scheduling; the scene owns geometric framing and one cancellable interpolation.
export function createActionCamera({move,cancelMove,dwellMs=1500}){
 const state={phase:'idle',view:null,pending:null,roam:false,generation:0,until:0};
 function go(view,done){
  const generation=++state.generation;state.view=view;state.phase=view.mode==='operation'?'focusing':'preparing';
  move(view,()=>{if(generation!==state.generation || state.roam)return;state.phase=view.mode==='operation'?'operation':'idle';done?.();});
 }
 return {
  state,
  request(task){if(!task || task.id==='complete'){state.pending=null;return;}state.pending=task;if(state.roam || ['focusing','operation','dwell'].includes(state.phase))return;
   const station=actionStation(task);if(state.view?.mode==='prepare' && state.view.station===station && state.view.task?.id===task?.id)return;
   // Same-station dial observations don't move the camera fifteen times.
   if(station==='cell' && state.view?.station==='cell' && ['record-reading','next-increment'].includes(task?.id))return;
   go({task,station,mode:'prepare'});
  },
  begin(task,done){if(state.roam)return;go({task,station:actionStation(task),mode:'operation'},done);},
  complete(now,duration=0){state.phase='dwell';state.until=now+duration+dwellMs;},
  tick(now){if(!state.roam && state.phase==='dwell' && now>=state.until){state.phase='idle';const task=state.pending;if(task)go({task,station:actionStation(task),mode:'prepare'});}},
  freeze(){state.generation++;cancelMove();if(state.phase==='preparing')state.phase='idle';},
  setRoam(value){
   state.generation++;cancelMove();state.roam=value;
   // A committed result keeps its original deadline and pending next task.
   // Uncommitted readiness is invalidated; restore the pose before preparing.
   if(state.phase==='dwell' || value)return;
   const interrupted=['preparing','focusing','operation'].includes(state.phase);
   state.phase='idle';
   const task=state.pending;
   if(task && (interrupted || state.view?.task?.id!==task.id))go({task,station:actionStation(task),mode:'prepare'});
  },
  abort(){state.generation++;cancelMove();state.phase='idle';state.until=0;const task=state.pending;if(task && !state.roam)go({task,station:actionStation(task),mode:'prepare'});},
  reset(){state.generation++;cancelMove();state.phase='idle';state.view=null;state.pending=null;state.until=0;},
  busy(){return ['focusing','operation','dwell'].includes(state.phase);},
 };
}
