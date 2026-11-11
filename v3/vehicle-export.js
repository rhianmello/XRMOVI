/* XRMOVI: native .xlsx export, no external spreadsheet library, company data stays in browser. */
export const VEHICLE_COLUMNS=Object.freeze([
 {key:'plate',label:'Placa',fixed:true,type:'text',width:17},
 {key:'model',label:'Modelo',fixed:true,type:'text',width:30},
 {key:'brand',label:'Marca',type:'text',width:23},
 {key:'category',label:'Tipo / categoria',type:'text',width:24},
 {key:'manufacture_year',label:'Ano de fabricação',type:'number',width:20},
 {key:'model_year',label:'Ano do modelo',type:'number',width:19},
 {key:'status',label:'Status',type:'text',width:20},
 {key:'driver_name',label:'Motorista vinculado',type:'text',width:35},
 {key:'contract_name',label:'Contrato',type:'text',width:38},
 {key:'unit_name',label:'Unidade / setor',type:'text',width:25},
 {key:'odometer_value',label:'KM / Horímetro',type:'number',width:20},
 {key:'notes',label:'Observações',type:'text',width:45}
]);
export const selectedVehicleColumns=keys=>{
 const list=new Set(keys||[]);
 return VEHICLE_COLUMNS.filter(col=>col.fixed||list.has(col.key));
};
export function vehicleExportRows(vehicles,contracts=[]){
 const contractNames=new Map((contracts||[]).map(c=>[c.id,c.name||c.contract_code||'']));
 return (vehicles||[]).map(v=>({
  ...v,contract_name:contractNames.get(v.contract_id)||'',
  driver_name:v.driver_name||'',
 }));
}
const xmlEscape=value=>String(value??'').replace(/[\u0000-\u0008\u000B\u000C\u000E-\u001F\uFFFE\uFFFF]/g,'')
 .replace(/[&<>"']/g,ch=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&apos;'}[ch]));
function excelColumn(index){
 let s='';for(let i=index+1;i>0;i=Math.floor((i-1)/26))s=String.fromCharCode(65+(i-1)%26)+s;return s;
}
const utf8=new TextEncoder();
function little16(n){return [n&255,(n>>>8)&255];}
function little32(n){return [n&255,(n>>>8)&255,(n>>>16)&255,(n>>>24)&255];}
const crcTable=(()=>{const a=new Uint32Array(256);for(let i=0;i<256;i++){let c=i;for(let k=0;k<8;k++)c=c&1?0xEDB88320^(c>>>1):c>>>1;a[i]=c>>>0;}return a;})();
function crc32(bytes){let c=0xFFFFFFFF;for(const b of bytes)c=crcTable[(c^b)&255]^(c>>>8);return(c^0xFFFFFFFF)>>>0;}
function zip(files){
 const local=[],central=[];let position=0;
 for(const [path,body] of files){
  const name=utf8.encode(path),content=utf8.encode(body),sum=crc32(content);
  const header=new Uint8Array([0x50,0x4b,0x03,0x04,...little16(20),...little16(0),...little16(0),
   ...little16(0),...little16(0),...little32(sum),...little32(content.length),...little32(content.length),
   ...little16(name.length),...little16(0)]);
  local.push(header,name,content);
  const directory=new Uint8Array([0x50,0x4b,0x01,0x02,...little16(20),...little16(20),
   ...little16(0),...little16(0),...little16(0),...little16(0),...little32(sum),
   ...little32(content.length),...little32(content.length),...little16(name.length),
   ...little16(0),...little16(0),...little16(0),...little16(0),...little32(0),...little32(position)]);
  central.push(directory,name);position+=header.length+name.length+content.length;
 }
 const centralLength=central.reduce((n,part)=>n+part.length,0),end=new Uint8Array([
  0x50,0x4b,0x05,0x06,...little16(0),...little16(0),...little16(files.length),...little16(files.length),
  ...little32(centralLength),...little32(position),...little16(0)]);
 const output=new Uint8Array(position+centralLength+end.length);let offset=0;
 for(const part of [...local,...central,end]){output.set(part,offset);offset+=part.length;}
 return output;
}
function stringCell(ref,text,style=0){
 return '<c r="'+ref+'" t="inlineStr" s="'+style+'"><is><t xml:space="preserve">'+xmlEscape(text)+'</t></is></c>';
}
function dataCell(ref,value,type){
 if(value==null||value==='')return stringCell(ref,'');
 if(type==='number'){
  const number=Number(value);
  if(Number.isFinite(number)&&number>=0)return '<c r="'+ref+'" s="2"><v>'+number+'</v></c>';
 }
 return stringCell(ref,value);
}
export function buildVehicleXlsx(vehicles,columns=VEHICLE_COLUMNS){
 const selected=selectedVehicleColumns(columns.map(c=>c.key));
 const headers=selected.map((col,i)=>stringCell(excelColumn(i)+'1',col.label,1)).join('');
 const rows=['<row r="1" ht="29" customHeight="1">'+headers+'</row>'];
 (vehicles||[]).forEach((vehicle,index)=>{
  const rowNumber=index+2;
  rows.push('<row r="'+rowNumber+'">'+selected.map((col,j)=>dataCell(excelColumn(j)+rowNumber,vehicle[col.key],col.type)).join('')+'</row>');
 });
 const last=excelColumn(selected.length-1),lastRow=Math.max(1,(vehicles||[]).length+1);
 const cols=selected.map((col,i)=>'<col min="'+(i+1)+'" max="'+(i+1)+'" width="'+col.width+'" customWidth="1"/>').join('');
 const sheet='<?xml version="1.0" encoding="UTF-8" standalone="yes"?>'+
 '<worksheet xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main">'+
 '<dimension ref="A1:'+last+lastRow+'"/><sheetViews><sheetView workbookViewId="0" showGridLines="1">'+
 '<pane xSplit="2" ySplit="1" topLeftCell="C2" activePane="bottomRight" state="frozen"/>'+
 '<selection pane="bottomRight" activeCell="C2" sqref="C2"/></sheetView></sheetViews>'+
 '<sheetFormatPr defaultRowHeight="16"/><cols>'+cols+'</cols><sheetData>'+rows.join('')+'</sheetData>'+
 '<autoFilter ref="A1:'+last+lastRow+'"/></worksheet>';
 const files=[
 ['[Content_Types].xml','<?xml version="1.0" encoding="UTF-8" standalone="yes"?><Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types"><Default Extension="rels" ContentType="application/vnd.openxmlformats-package.relationships+xml"/><Default Extension="xml" ContentType="application/xml"/><Override PartName="/xl/workbook.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.sheet.main+xml"/><Override PartName="/xl/worksheets/sheet1.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.worksheet+xml"/><Override PartName="/xl/styles.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.styles+xml"/></Types>'],
 ['_rels/.rels','<?xml version="1.0" encoding="UTF-8"?><Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships"><Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/officeDocument" Target="xl/workbook.xml"/></Relationships>'],
 ['xl/workbook.xml','<?xml version="1.0" encoding="UTF-8"?><workbook xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main" xmlns:r="http://schemas.openxmlformats.org/officeDocument/2006/relationships"><sheets><sheet name="Veículos" sheetId="1" r:id="rId1"/></sheets></workbook>'],
 ['xl/_rels/workbook.xml.rels','<?xml version="1.0" encoding="UTF-8"?><Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships"><Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/worksheet" Target="worksheets/sheet1.xml"/><Relationship Id="rId2" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/styles" Target="styles.xml"/></Relationships>'],
 ['xl/styles.xml','<?xml version="1.0" encoding="UTF-8"?><styleSheet xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main"><fonts count="2"><font><sz val="11"/><name val="Aptos"/></font><font><b/><color rgb="FFFFFFFF"/><sz val="11"/><name val="Aptos"/></font></fonts><fills count="2"><fill><patternFill patternType="none"/></fill><fill><patternFill patternType="solid"><fgColor rgb="FF0E344A"/><bgColor indexed="64"/></patternFill></fill></fills><borders count="1"><border><left/><right/><top/><bottom/><diagonal/></border></borders><cellStyleXfs count="1"><xf numFmtId="0" fontId="0" fillId="0" borderId="0"/></cellStyleXfs><cellXfs count="3"><xf numFmtId="0" fontId="0" fillId="0" borderId="0" xfId="0"/><xf numFmtId="0" fontId="1" fillId="1" borderId="0" xfId="0" applyFill="1"/><xf numFmtId="0" fontId="0" fillId="0" borderId="0" xfId="0" applyNumberFormat="1"/></cellXfs></styleSheet>'],
 ['xl/worksheets/sheet1.xml',sheet]
 ];
 return zip(files);
}
export function downloadVehicleXlsx(vehicles,selectedKeys,filename='xrmovi-veiculos.xlsx'){
 if(!vehicles?.length)throw Error('Nenhum veículo cadastrado para exportar.');
 const selected=selectedVehicleColumns(selectedKeys);
 const bytes=buildVehicleXlsx(vehicles,selected);
 const blob=new Blob([bytes],{type:'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet'});
 const url=URL.createObjectURL(blob),link=document.createElement('a');
 link.href=url;link.download=filename;document.body.append(link);link.click();link.remove();
 setTimeout(()=>URL.revokeObjectURL(url),2000);
 return {count:vehicles.length,columns:selected.length};
}
export function setupVehicleExport({getCompany,getVehicles,getContracts,notify}){
 const launch=document.getElementById('xrm-export-vehicles');
 if(!launch)throw Error('Botão de exportação de veículos não encontrado.');
 const backdrop=document.createElement('div');backdrop.className='xrm-vehicle-export-modal';backdrop.hidden=true;
 backdrop.innerHTML='<section class="xrm-vehicle-export-panel" role="dialog" aria-modal="true" aria-labelledby="xrm-vehicle-export-title">'+
  '<header><div><small>RELATÓRIO EXCEL • XRMOVI</small><h2 id="xrm-vehicle-export-title" tabindex="-1">Selecionar colunas</h2></div><button type="button" id="xrm-vehicle-export-close" aria-label="Fechar">×</button></header>'+
  '<p>Placa e modelo são obrigatórios e permanecerão nas duas primeiras colunas, fixas ao rolar a planilha. As demais estão selecionadas e podem ser retiradas.</p>'+
  '<div class="xrm-vehicle-export-summary" id="xrm-vehicle-export-summary"></div>'+
  '<div class="xrm-vehicle-export-columns" id="xrm-vehicle-export-columns" role="group" aria-label="Colunas do relatório"></div>'+
  '<footer><button type="button" id="xrm-vehicle-export-all">Selecionar todas</button><button type="button" id="xrm-vehicle-export-cancel">Cancelar</button><button type="button" class="primary" id="xrm-vehicle-export-download">Baixar Excel (.xlsx)</button></footer>'+
 '</section>';
 document.body.append(backdrop);
 const q=s=>backdrop.querySelector(s);let companyId=null,previousFocus=null;
 const selected=()=>[...backdrop.querySelectorAll('input[data-col]:checked')].map(x=>x.dataset.col);
 function describe(){
  const current=getCompany();const ids=selected();
  q('#xrm-vehicle-export-summary').textContent=(current?.name||'Empresa')+' · '+getVehicles().length+' veículo(s) cadastrados · '+ids.length+' coluna(s) selecionadas';
 }
 function close(){backdrop.hidden=true;previousFocus?.focus?.({preventScroll:true});}
 function open(){
  if(!getCompany()){notify?.('Escolha uma empresa antes de exportar.');return;}
  companyId=getCompany().id;previousFocus=document.activeElement;
  const holder=q('#xrm-vehicle-export-columns');holder.replaceChildren();
  for(const col of VEHICLE_COLUMNS){
   const label=document.createElement('label');label.className='xrm-vehicle-export-col';
   if(col.fixed)label.dataset.fixed='true';
   const input=document.createElement('input');input.type='checkbox';input.checked=true;input.disabled=Boolean(col.fixed);
   input.dataset.col=col.key;
   input.addEventListener('change',describe);
   const name=document.createElement('span');name.textContent=col.label;
   label.append(input,name);
   if(col.fixed){const fixed=document.createElement('small');fixed.textContent='Fixa';label.append(fixed);}
   holder.append(label);
  }
  backdrop.hidden=false;describe();q('#xrm-vehicle-export-title').focus({preventScroll:true});
 }
 launch.onclick=open;
 q('#xrm-vehicle-export-close').onclick=close;
 q('#xrm-vehicle-export-cancel').onclick=close;
 q('#xrm-vehicle-export-all').onclick=()=>{backdrop.querySelectorAll('input[data-col]:not(:disabled)').forEach(x=>x.checked=true);describe()};
 backdrop.addEventListener('click',event=>{if(event.target===backdrop)close()});
 backdrop.addEventListener('keydown',event=>{
  if(event.key==='Escape'){event.preventDefault();close();}
  if(event.key!=='Tab')return;
  const items=[...backdrop.querySelectorAll('button:not([disabled]),input:not([disabled])')].filter(x=>x.getClientRects().length);
  if(!items.length)return;
  if(event.shiftKey&&document.activeElement===items[0]){event.preventDefault();items.at(-1).focus();}
  else if(!event.shiftKey&&document.activeElement===items.at(-1)){event.preventDefault();items[0].focus();}
 });
 q('#xrm-vehicle-export-download').onclick=()=>{
  if(!getCompany()||getCompany().id!==companyId){notify?.('A empresa foi alterada. Reabra a exportação.');close();return;}
  try{
   const rows=vehicleExportRows(getVehicles(),getContracts());
   const stamp=new Date().toLocaleDateString('en-CA',{timeZone:'America/Sao_Paulo'});
   const result=downloadVehicleXlsx(rows,selected(),'xrmovi-veiculos-'+stamp+'.xlsx');
   notify?.('Excel gerado: '+result.count+' veículos e '+result.columns+' colunas.');
   close();
  }catch(error){notify?.(error.message||'Não foi possível gerar o arquivo Excel.');}
 };
 return {open,close};
}
