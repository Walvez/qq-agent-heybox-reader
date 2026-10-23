import {publicEncrypt,constants} from 'node:crypto';
import {apiRequest,cookieHeader} from './auth.js';
// Public RSA key published by the official web login client (2026-10-24).
const publicKey=`-----BEGIN PUBLIC KEY-----
MIGfMA0GCSqGSIb3DQEBAQUAA4GNADCBiQKBgQDZgjVwAiKTjZ55nG+mW6r3TSU4
ECvNYqDMIS/bhCj2QaH5GI/KZb2TBp+CBvUj9SLFnmJQ0kzHzHoGZCQ88VevCffF7JePGF9cmKQqotlfTKbV4oxV5iLz7JSG6b/Vg7AXtrTolNtWsa8HiB0tI0YClYaQlOXm4UxLeSxQwSFETwIDAQAB
-----END PUBLIC KEY-----`;
export function encryptedLoginForm({phone,password,areaCode='+86'}){
  if(!/^\d{5,15}$/.test(phone||'')||!/^\+\d{1,4}$/.test(areaCode)||typeof password!=='string'||!password||Buffer.byteLength(password)>117)throw Error('INVALID_LOGIN');
  const encrypt=v=>publicEncrypt({key:publicKey,padding:constants.RSA_PKCS1_PADDING},Buffer.from(v)).toString('base64');
  return {phone_num:encrypt(areaCode+phone),pwd:encrypt(password)};
}
export async function passwordLogin(input,{fetch:fetcher=globalThis.fetch}={}){
  const d=await apiRequest(fetcher,'/account/login/',{form:encryptedLoginForm(input)});
  const p=d.result?.profile||{},id=p.heybox_id||d.result?.account_detail?.userid,key=d.result?.pkey;
  if(d.status!=='ok'||!/^\d+$/.test(String(id||''))||typeof key!=='string'||/[;\r\n]/.test(key)||!key)throw Error('LOGIN_FAILED');
  return {cookie:cookieHeader(`user_pkey=${key}; user_heybox_id=${id}; pkey=${key}; heybox_id=${id}`),account:{id:String(id),nickname:String(p.nickname||'').slice(0,100)}};
}
