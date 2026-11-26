import { db,doc,onSnapshot } from './firebase.js';
import { accountText } from './pages/shared/company-accounts.js';
const row=document.getElementById('home-bank-account'),text=document.getElementById('home-bank-account-text');
if(row&&text)onSnapshot(doc(db,'settings','companyInfo'),snap=>{
  const value=snap.exists()?accountText(snap.data()):'';
  text.textContent=value;row.hidden=!value;
},()=>{row.hidden=true;text.textContent='';});
