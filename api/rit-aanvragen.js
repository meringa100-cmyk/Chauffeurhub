import { get, put } from '@vercel/blob';

const ORIGIN = 'https://meringa100-cmyk.github.io';
const STORE_PATH = 'demo/rit-aanvragen.json';
function send(res,status,body){res.status(status).setHeader('Content-Type','application/json; charset=utf-8');res.setHeader('Cache-Control','no-store');res.setHeader('X-Content-Type-Options','nosniff');return res.end(JSON.stringify(body));}
async function load(){try{const stored=await get(STORE_PATH,{access:'private'});if(stored?.statusCode===200)return JSON.parse(await new Response(stored.stream).text());}catch(_){}return {requests:[]};}
async function save(data){await put(STORE_PATH,JSON.stringify(data),{access:'private',addRandomSuffix:false,allowOverwrite:true,contentType:'application/json'});}
export default async function handler(req,res){
 const origin=req.headers.origin;if(origin&&origin!==ORIGIN)return send(res,403,{error:'Origin niet toegestaan.'});
 res.setHeader('Access-Control-Allow-Origin',ORIGIN);res.setHeader('Vary','Origin');res.setHeader('Access-Control-Allow-Methods','GET, POST, OPTIONS');res.setHeader('Access-Control-Allow-Headers','Content-Type');
 if(req.method==='OPTIONS')return res.status(204).end();
 try{
  const data=await load();data.requests=Array.isArray(data.requests)?data.requests:[];
  if(req.method==='GET'){
   const requestId=String(req.query?.requestId||'').trim();
   if(requestId){const request=data.requests.find(x=>x.requestId===requestId);return request?send(res,200,{ok:true,request}):send(res,404,{ok:false,error:'Aanvraag niet gevonden.'});}
   const status=req.query?.status||'all';
   return send(res,200,{ok:true,requests:data.requests.filter(x=>status==='all'||x.status===status).sort((a,b)=>b.createdAt.localeCompare(a.createdAt))});
  }
  if(req.method!=='POST'){res.setHeader('Allow','GET, POST, OPTIONS');return send(res,405,{error:'Methode niet toegestaan.'});}
  const body=typeof req.body==='string'?JSON.parse(req.body):req.body;
  if(body?.action==='submit'){
   const address=String(body.address||'').trim(),childName=String(body.childName||'').trim();
   if(!address||address.length>240||childName.length>100)return send(res,400,{error:'Vul een geldig adres in; naam maximaal 100 tekens.'});
   const request={requestId:'RIT-'+Date.now().toString(36).toUpperCase()+'-'+Math.random().toString(36).slice(2,6).toUpperCase(),childName,address,destination:String(body.destination||'').trim().slice(0,240),note:String(body.note||'').trim().slice(0,500),source:'ChauffeursHub',status:'pending',createdAt:new Date().toISOString()};
   data.requests.push(request);await save(data);return send(res,201,{ok:true,request});
  }
  if(body?.action==='review'){
   const request=data.requests.find(x=>x.requestId===body.requestId);
   if(!request)return send(res,404,{error:'Aanvraag niet gevonden.'});
   if(request.status!=='pending')return send(res,409,{error:'Deze aanvraag is al behandeld.'});
   if(!['approved','rejected'].includes(body.decision))return send(res,400,{error:'Ongeldige beslissing.'});
   request.status=body.decision;request.reviewedAt=new Date().toISOString();await save(data);return send(res,200,{ok:true,request});
  }
  return send(res,400,{error:'Ongeldige actie.'});
 }catch(error){return send(res,500,{error:'Serverfout bij adresaanvraag.',detail:error?.message||'Onbekend'});}
}