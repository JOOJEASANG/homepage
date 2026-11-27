import {normalizeStudioSettings} from './settings-model.js';
// One public document read per editor, no live subscriptions or customer uploads.
export async function loadStudioSettings(){
  try{const {db,doc,getDoc}=await import('../../firebase.js');const snap=await getDoc(doc(db,'settings','printStudio'));return snap.exists()?normalizeStudioSettings(snap.data()):null;}catch{return null;}
}
