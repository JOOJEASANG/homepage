// Only the selected account is written to public settings/companyInfo.
const trim=value=>String(value??'').trim();
export function normalizeAccount(value={}) {
  return {bankName:trim(value.bankName),accountNum:trim(value.accountNum||value.accountNumber),accountHolder:trim(value.accountHolder)};
}
export function hasCompleteAccount(value) {
  const a=normalizeAccount(value); return !!(a.accountNum&&a.accountHolder);
}
export function accountText(value) {
  const a=normalizeAccount(value);
  return hasCompleteAccount(a) ? [a.bankName,a.accountNum].filter(Boolean).join(' ')+' (예금주: '+a.accountHolder+')' : '';
}
export function loadAccountList(privateData, company={},payment={}) {
  if(privateData && Array.isArray(privateData.accounts)) {
    const accounts=privateData.accounts.map(normalizeAccount);
    const index=Number(privateData.defaultIndex);
    return {accounts,defaultIndex:accounts.length?(Number.isInteger(index)&&index>=0&&index<accounts.length?index:0):-1};
  }
  const legacy=normalizeAccount(company);
  const guide=normalizeAccount(payment);
  const same=legacy.accountNum&&legacy.accountNum===guide.accountNum;
  const accounts=[];
  if(legacy.accountNum||legacy.accountHolder)accounts.push({...legacy,bankName:legacy.bankName||(same?guide.bankName:''),accountHolder:legacy.accountHolder||(same?guide.accountHolder:'')});
  if(guide.accountNum&&!same)accounts.push(guide);
  return {accounts,defaultIndex:accounts.length?0:-1};
}
export function prepareAccountSave(rows,defaultIndex) {
  const accounts=[];let selected=-1;
  for(const [i,raw] of rows.entries()){
    const account=normalizeAccount(raw);
    if(!account.bankName&&!account.accountNum&&!account.accountHolder)continue;
    if(!hasCompleteAccount(account))throw Error('계좌번호와 예금주를 모두 입력해 주세요.');
    if(i===defaultIndex)selected=accounts.length;
    accounts.push(account);
  }
  if(accounts.length&&selected<0)selected=0;
  const current=accounts[selected]||normalizeAccount();
  return {privateData:{accounts,defaultIndex:selected},publicData:{...current,accountsManaged:true},paymentData:{bankName:current.bankName,accountNumber:current.accountNum,accountHolder:current.accountHolder}};
}
